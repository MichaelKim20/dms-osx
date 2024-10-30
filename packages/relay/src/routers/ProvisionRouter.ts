import { Config } from "../common/Config";
import { logger } from "../common/Logger";
import { ContractManager } from "../contract/ContractManager";
import { ISignerItem, RelaySigners } from "../contract/Signers";
import { Metrics } from "../metrics/Metrics";
import { WebService } from "../service/WebService";
import { GraphStorage } from "../storage/GraphStorage";
import { RelayStorage } from "../storage/RelayStorage";
import { ContractUtils } from "../utils/ContractUtils";
import { ResponseMessage } from "../utils/Errors";
import { Validation } from "../validation";

import { AddressZero } from "@ethersproject/constants";
import { BigNumber, ethers } from "ethers";
import express from "express";
import { body, param, validationResult } from "express-validator";
import { BOACoin } from "../common/Amount";

export class ProvisionRouter {
    private web_service: WebService;
    private readonly config: Config;
    private readonly contractManager: ContractManager;
    private readonly metrics: Metrics;
    private readonly relaySigners: RelaySigners;
    private storage: RelayStorage;
    private graph_sidechain: GraphStorage;
    private graph_mainchain: GraphStorage;

    constructor(
        service: WebService,
        config: Config,
        contractManager: ContractManager,
        metrics: Metrics,
        storage: RelayStorage,
        graph_sidechain: GraphStorage,
        graph_mainchain: GraphStorage,
        relaySigners: RelaySigners
    ) {
        this.web_service = service;
        this.config = config;
        this.contractManager = contractManager;
        this.metrics = metrics;

        this.storage = storage;
        this.graph_sidechain = graph_sidechain;
        this.graph_mainchain = graph_mainchain;
        this.relaySigners = relaySigners;
    }

    private get app(): express.Application {
        return this.web_service.app;
    }

    /***
     * 트팬잭션을 중계할 때 사용될 서명자
     * @private
     */
    private async getRelaySigner(provider?: ethers.providers.Provider): Promise<ISignerItem> {
        if (provider === undefined) provider = this.contractManager.sideChainProvider;
        return this.relaySigners.getSigner(provider);
    }

    /***
     * 트팬잭션을 중계할 때 사용될 서명자
     * @private
     */
    private releaseRelaySigner(signer: ISignerItem) {
        signer.using = false;
    }

    /**
     * Make the response data
     * @param code      The result code
     * @param data      The result data
     * @param error     The error
     * @private
     */
    private makeResponseData(code: number, data: any, error?: any): any {
        return {
            code,
            data,
            error,
        };
    }

    public async registerRoutes() {
        this.app.post(
            "/v1/provision/register",
            [
                body("provider").exists().trim().isEthereumAddress(),
                body("signature")
                    .exists()
                    .trim()
                    .matches(/^(0x)[0-9a-f]{130}$/i),
            ],
            this.provision_register.bind(this)
        );

        this.app.get(
            "/v1/provision/balance/:provider",
            [param("provider").exists().trim().isEthereumAddress()],
            this.provision_balance.bind(this)
        );

        this.app.get(
            "/v1/provision/status/:provider",
            [param("provider").exists().trim().isEthereumAddress()],
            this.provision_status.bind(this)
        );

        this.app.post(
            "/v1/provision/send/account",
            [
                body("provider").exists().trim().isEthereumAddress(),
                body("receiver").exists().trim().isEthereumAddress(),
                body("amount").exists().custom(Validation.isAmount),
                body("signature")
                    .exists()
                    .trim()
                    .matches(/^(0x)[0-9a-f]{130}$/i),
            ],
            this.provision_send_account.bind(this)
        );

        this.app.post(
            "/v1/provision/send/phoneHash",
            [
                body("provider").exists().trim().isEthereumAddress(),
                body("receiver")
                    .exists()
                    .trim()
                    .matches(/^(0x)[0-9a-f]{64}$/i),
                body("amount").exists().custom(Validation.isAmount),
                body("signature")
                    .exists()
                    .trim()
                    .matches(/^(0x)[0-9a-f]{130}$/i),
            ],
            this.provision_send_phone_hash.bind(this)
        );
    }

    private async provision_register(req: express.Request, res: express.Response) {
        logger.http(`POST /v1/provision/register ${req.ip}:${JSON.stringify(req.body)}`);

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(200).json(ResponseMessage.getErrorMessage("2001", { validation: errors.array() }));
        }

        const signerItem = await this.getRelaySigner(this.contractManager.sideChainProvider);
        try {
            const provider: string = String(req.body.provider).trim();
            const signature: string = String(req.body.signature).trim();

            const nonce = await this.contractManager.sideLedgerContract.nonceOf(provider);
            const message = ContractUtils.getRegisterProviderMessage(provider, nonce, this.contractManager.sideChainId);
            if (!ContractUtils.verifyMessage(provider, message, signature))
                return res.status(200).json(ResponseMessage.getErrorMessage("1501"));

            const balance = await this.contractManager.sideLedgerContract.tokenBalanceOf(provider);
            const minimum = BOACoin.make(this.config.relay.initialBalanceOfProvider).value;
            if (balance.lt(minimum)) {
                return res.status(200).json(ResponseMessage.getErrorMessage("1511"));
            }

            await this.storage.postNewProvider(provider);

            this.metrics.add("success", 1);
            return res.status(200).json(this.makeResponseData(0, { provider }));
        } catch (error: any) {
            const msg = ResponseMessage.getEVMErrorMessage(error);
            logger.error(`POST /v1/provision/register : ${msg.error.message}`);
            this.metrics.add("failure", 1);
            return res.status(200).json(this.makeResponseData(msg.code, undefined, msg.error));
        } finally {
            this.releaseRelaySigner(signerItem);
        }
    }

    private async provision_balance(req: express.Request, res: express.Response) {
        logger.http(`GET /v1/provision/balance/:provider ${req.ip}:${JSON.stringify(req.params)}`);

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(200).json(ResponseMessage.getErrorMessage("2001", { validation: errors.array() }));
        }

        try {
            const provider: string = String(req.params.provider).trim();
            const tokenBalance = await this.contractManager.sideLedgerContract.tokenBalanceOf(provider);
            const tokenValue = await this.contractManager.sideCurrencyRateContract.convertTokenToPoint(tokenBalance);
            this.metrics.add("success", 1);
            return res.status(200).json(
                this.makeResponseData(0, {
                    provider,
                    providable: {
                        token: tokenBalance.toString(),
                        point: tokenValue.toString(),
                    },
                })
            );
        } catch (error: any) {
            const msg = ResponseMessage.getEVMErrorMessage(error);
            logger.error(`GET /v1/provision/balance/:provider : ${msg.error.message}`);
            this.metrics.add("failure", 1);
            return res.status(200).json(this.makeResponseData(msg.code, undefined, msg.error));
        }
    }

    private async provision_status(req: express.Request, res: express.Response) {
        logger.http(`GET /v1/provision/status/:provider ${req.ip}:${JSON.stringify(req.params)}`);

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(200).json(ResponseMessage.getErrorMessage("2001", { validation: errors.array() }));
        }

        try {
            const provider: string = String(req.params.provider).trim();
            const isProvider = await this.contractManager.sideLedgerContract.isProvider(provider);
            this.metrics.add("success", 1);
            return res.status(200).json(
                this.makeResponseData(0, {
                    provider,
                    enable: isProvider,
                })
            );
        } catch (error: any) {
            const msg = ResponseMessage.getEVMErrorMessage(error);
            logger.error(`GET /v1/provision/status/:provider : ${msg.error.message}`);
            this.metrics.add("failure", 1);
            return res.status(200).json(this.makeResponseData(msg.code, undefined, msg.error));
        }
    }

    private async provision_send_account(req: express.Request, res: express.Response) {
        logger.http(`POST /v1/provision/send/account ${req.ip}:${JSON.stringify(req.body)}`);

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(200).json(ResponseMessage.getErrorMessage("2001", { validation: errors.array() }));
        }

        const signerItem = await this.getRelaySigner(this.contractManager.sideChainProvider);
        try {
            const provider: string = String(req.body.provider).trim();
            const receiver: string = String(req.body.receiver).trim();
            const amount: BigNumber = BigNumber.from(req.body.amount);
            const signature: string = String(req.body.signature).trim();

            let agent = await this.contractManager.sideLedgerContract.provisionAgentOf(provider);
            if (agent === AddressZero) agent = provider;

            const nonce = await this.contractManager.sideLedgerContract.nonceOf(agent);
            const message = ContractUtils.getProvidePointToAddressMessage(
                provider,
                receiver,
                amount,
                nonce,
                this.contractManager.sideChainId
            );
            if (!ContractUtils.verifyMessage(agent, message, signature))
                return res.status(200).json(ResponseMessage.getErrorMessage("1501"));
            const tx = await this.contractManager.sideLoyaltyProviderContract
                .connect(signerItem.signer)
                .provideToAddress(provider, receiver, amount, signature);
            this.metrics.add("success", 1);
            return res.status(200).json(this.makeResponseData(0, { provider, receiver, amount, txHash: tx.hash }));
        } catch (error: any) {
            const msg = ResponseMessage.getEVMErrorMessage(error);
            logger.error(`POST /v1/provision/send/account : ${msg.error.message}`);
            this.metrics.add("failure", 1);
            return res.status(200).json(this.makeResponseData(msg.code, undefined, msg.error));
        } finally {
            this.releaseRelaySigner(signerItem);
        }
    }

    private async provision_send_phone_hash(req: express.Request, res: express.Response) {
        logger.http(`POST /v1/provision/send/phoneHash ${req.ip}:${JSON.stringify(req.body)}`);

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(200).json(ResponseMessage.getErrorMessage("2001", { validation: errors.array() }));
        }

        const signerItem = await this.getRelaySigner(this.contractManager.sideChainProvider);
        try {
            const provider: string = String(req.body.provider).trim();
            const receiver: string = String(req.body.receiver).trim();
            const amount: BigNumber = BigNumber.from(req.body.amount);
            const signature: string = String(req.body.signature).trim();

            let agent = await this.contractManager.sideLedgerContract.provisionAgentOf(provider);
            if (agent === AddressZero) agent = provider;

            const nonce = await this.contractManager.sideLedgerContract.nonceOf(agent);
            const message = ContractUtils.getProvidePointToPhoneMessage(
                provider,
                receiver,
                amount,
                nonce,
                this.contractManager.sideChainId
            );
            if (!ContractUtils.verifyMessage(agent, message, signature))
                return res.status(200).json(ResponseMessage.getErrorMessage("1501"));
            const tx = await this.contractManager.sideLoyaltyProviderContract
                .connect(signerItem.signer)
                .provideToPhone(provider, receiver, amount, signature);
            this.metrics.add("success", 1);
            return res.status(200).json(this.makeResponseData(0, { provider, receiver, amount, txHash: tx.hash }));
        } catch (error: any) {
            const msg = ResponseMessage.getEVMErrorMessage(error);
            logger.error(`POST /v1/provision/send/phoneHash : ${msg.error.message}`);
            this.metrics.add("failure", 1);
            return res.status(200).json(this.makeResponseData(msg.code, undefined, msg.error));
        } finally {
            this.releaseRelaySigner(signerItem);
        }
    }
}