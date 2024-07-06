import {
    BIP20DelegatedTransfer,
    Bridge,
    CurrencyRate,
    Ledger,
    LoyaltyBridge,
    LoyaltyConsumer,
    LoyaltyExchanger,
    LoyaltyProvider,
    LoyaltyToken,
    LoyaltyTransfer,
    PhoneLinkCollection,
    Shop,
} from "../../typechain-types";
import { Config } from "../common/Config";
import { logger } from "../common/Logger";

import { ethers } from "ethers";
import * as hre from "hardhat";
// tslint:disable-next-line:no-submodule-imports
import { HttpNetworkConfig } from "hardhat/src/types/config";
import { ContractUtils } from "../utils/ContractUtils";

export class ContractManager {
    private readonly config: Config;
    private _sideTokenContract: BIP20DelegatedTransfer | undefined;
    private _sideLedgerContract: Ledger | undefined;
    private _sidePhoneLinkerContract: PhoneLinkCollection | undefined;
    private _sideCurrencyRateContract: CurrencyRate | undefined;
    private _sideShopContract: Shop | undefined;
    private _sideLoyaltyProviderContract: LoyaltyProvider | undefined;
    private _sideLoyaltyConsumerContract: LoyaltyConsumer | undefined;
    private _sideLoyaltyExchangerContract: LoyaltyExchanger | undefined;
    private _sideLoyaltyTransferContract: LoyaltyTransfer | undefined;
    private _sideLoyaltyBridgeContract: LoyaltyBridge | undefined;
    private _sideChainBridgeContract: Bridge | undefined;

    private _mainTokenContract: BIP20DelegatedTransfer | undefined;
    private _mainLoyaltyBridgeContract: Bridge | undefined;
    private _mainChainBridgeContract: Bridge | undefined;

    private _sideChainProvider: ethers.providers.Provider | undefined;
    private _mainChainProvider: ethers.providers.Provider | undefined;

    private _sideChainId: number | undefined;
    private _mainChainId: number | undefined;

    private _sideChainURL: string | undefined;
    private _mainChainURL: string | undefined;

    private _sideTokenId: string | undefined;
    private _mainTokenId: string | undefined;

    constructor(config: Config) {
        this.config = config;
    }

    public async attach() {
        logger.info(`SideChain.Network: ${this.config.contracts.sideChain.network}`);
        await hre.changeNetwork(this.config.contracts.sideChain.network);
        this._sideChainProvider = hre.ethers.provider;
        this._sideChainId = (await this._sideChainProvider.getNetwork()).chainId;
        logger.info(`SideChain.ChainId: ${this._sideChainId}`);

        this._sideChainURL = this.config.contracts.sideChain.url;
        if (this._sideChainURL === "") {
            const hardhatConfig = hre.config.networks[this.config.contracts.sideChain.network] as HttpNetworkConfig;
            if (hardhatConfig.url !== undefined) this._sideChainURL = hardhatConfig.url;
            else this._sideChainURL = "";
        }
        logger.info(`SideChain.URL: ${this._sideChainURL}`);

        const factory1 = await hre.ethers.getContractFactory("LoyaltyToken");
        this._sideTokenContract = factory1
            .attach(this.config.contracts.sideChain.tokenAddress)
            .connect(this._sideChainProvider);
        logger.info(`SideChain.Token: ${this._sideTokenContract.address}`);
        logger.info(`SideChain.Token.Name: ${await this._sideTokenContract.name()}`);
        logger.info(`SideChain.Token.Symbol: ${await this._sideTokenContract.symbol()}`);

        this._sideTokenId = ContractUtils.getTokenId(
            await this._sideTokenContract.name(),
            await this._sideTokenContract.symbol()
        );
        logger.info(`SideChain.TokenId: ${this._sideTokenId}`);

        const factory2 = await hre.ethers.getContractFactory("Ledger");
        this._sideLedgerContract = factory2
            .attach(this.config.contracts.sideChain.ledgerAddress)
            .connect(this._sideChainProvider);
        logger.info(`SideChain.Ledger: ${this._sideLedgerContract.address}`);

        const factory3 = await hre.ethers.getContractFactory("Shop");
        this._sideShopContract = factory3
            .attach(this.config.contracts.sideChain.shopAddress)
            .connect(this._sideChainProvider);
        logger.info(`SideChain.Shop: ${this._sideShopContract.address}`);

        const factory4 = await hre.ethers.getContractFactory("PhoneLinkCollection");
        this._sidePhoneLinkerContract = factory4
            .attach(this.config.contracts.sideChain.phoneLinkerAddress)
            .connect(this._sideChainProvider);
        logger.info(`SideChain.PhoneLinkCollection: ${this._sidePhoneLinkerContract.address}`);

        const factory5 = await hre.ethers.getContractFactory("CurrencyRate");
        this._sideCurrencyRateContract = factory5
            .attach(this.config.contracts.sideChain.currencyRateAddress)
            .connect(this._sideChainProvider);
        logger.info(`SideChain.CurrencyRate: ${this._sideCurrencyRateContract.address}`);

        const factory51 = await hre.ethers.getContractFactory("LoyaltyProvider");
        this._sideLoyaltyProviderContract = factory51
            .attach(this.config.contracts.sideChain.loyaltyProviderAddress)
            .connect(this._sideChainProvider);
        logger.info(`SideChain.LoyaltyProvider: ${this._sideLoyaltyProviderContract.address}`);

        const factory6 = await hre.ethers.getContractFactory("LoyaltyConsumer");
        this._sideLoyaltyConsumerContract = factory6
            .attach(this.config.contracts.sideChain.loyaltyConsumerAddress)
            .connect(this._sideChainProvider);
        logger.info(`SideChain.LoyaltyConsumer: ${this._sideLoyaltyConsumerContract.address}`);

        const factory7 = await hre.ethers.getContractFactory("LoyaltyExchanger");
        this._sideLoyaltyExchangerContract = factory7
            .attach(this.config.contracts.sideChain.loyaltyExchangerAddress)
            .connect(this._sideChainProvider);
        logger.info(`SideChain.LoyaltyExchanger: ${this._sideLoyaltyExchangerContract.address}`);

        const factory8 = await hre.ethers.getContractFactory("LoyaltyTransfer");
        this._sideLoyaltyTransferContract = factory8
            .attach(this.config.contracts.sideChain.loyaltyTransferAddress)
            .connect(this._sideChainProvider);
        logger.info(`SideChain.LoyaltyTransfer: ${this._sideLoyaltyTransferContract.address}`);

        const factory9 = await hre.ethers.getContractFactory("LoyaltyBridge");
        this._sideLoyaltyBridgeContract = factory9
            .attach(this.config.contracts.sideChain.loyaltyBridgeAddress)
            .connect(this._sideChainProvider);
        logger.info(`SideChain.LoyaltyBridge: ${this._sideLoyaltyBridgeContract.address}`);

        const factory10 = await hre.ethers.getContractFactory("Bridge");
        this._sideChainBridgeContract = factory10
            .attach(this.config.contracts.sideChain.chainBridgeAddress)
            .connect(this._sideChainProvider);
        logger.info(`SideChain.ChainBridge: ${this._sideChainBridgeContract.address}`);

        logger.info(`MainChain.Network: ${this.config.contracts.mainChain.network}`);
        await hre.changeNetwork(this.config.contracts.mainChain.network);
        this._mainChainProvider = hre.ethers.provider;
        this._mainChainId = (await this._mainChainProvider.getNetwork()).chainId;
        logger.info(`MainChain.ChainId: ${this._mainChainId}`);

        this._mainChainURL = this.config.contracts.mainChain.url;
        if (this._mainChainURL === "") {
            const hardhatConfig2 = hre.config.networks[this.config.contracts.mainChain.network] as HttpNetworkConfig;
            if (hardhatConfig2.url !== undefined) this._mainChainURL = hardhatConfig2.url;
            else this._mainChainURL = "";
        }
        logger.info(`MainChain.URL: ${this._mainChainURL}`);

        const factory11 = await hre.ethers.getContractFactory("LoyaltyToken");
        this._mainTokenContract = factory11
            .attach(this.config.contracts.mainChain.tokenAddress)
            .connect(this._mainChainProvider);
        logger.info(`MainChain.Token: ${this._mainTokenContract.address}`);
        logger.info(`MainChain.Token.Name: ${await this._mainTokenContract.name()}`);
        logger.info(`MainChain.Token.Symbol: ${await this._mainTokenContract.symbol()}`);

        this._mainTokenId = ContractUtils.getTokenId(
            await this._mainTokenContract.name(),
            await this._mainTokenContract.symbol()
        );
        logger.info(`MainChain.TokenId: ${this._mainTokenId}`);

        const factory12 = await hre.ethers.getContractFactory("Bridge");
        this._mainLoyaltyBridgeContract = factory12
            .attach(this.config.contracts.mainChain.loyaltyBridgeAddress)
            .connect(this._mainChainProvider);
        logger.info(`MainChain.LoyaltyBridge: ${this._mainLoyaltyBridgeContract.address}`);

        const factory13 = await hre.ethers.getContractFactory("Bridge");
        this._mainChainBridgeContract = factory13
            .attach(this.config.contracts.mainChain.chainBridgeAddress)
            .connect(this._mainChainProvider);
        logger.info(`MainChain.ChainBridge: ${this._mainChainBridgeContract.address}`);
    }

    public get mainChainProvider(): ethers.providers.Provider {
        if (this._mainChainProvider !== undefined) return this._mainChainProvider;
        else {
            logger.error("mainChainProvider is not ready yet.");
            process.exit(1);
        }
    }

    public get mainChainId(): number {
        if (this._mainChainId !== undefined) return this._mainChainId;
        else {
            logger.error("mainChainId is not ready yet.");
            process.exit(1);
        }
    }

    public get mainChainURL(): string {
        if (this._mainChainURL !== undefined) return this._mainChainURL;
        else {
            logger.error("mainChainURL is not ready yet.");
            process.exit(1);
        }
    }

    public get mainTokenId(): string {
        if (this._mainTokenId !== undefined) return this._mainTokenId;
        else {
            logger.error("mainTokenId is not ready yet.");
            process.exit(1);
        }
    }

    public get sideTokenId(): string {
        if (this._sideTokenId !== undefined) return this._sideTokenId;
        else {
            logger.error("sideTokenId is not ready yet.");
            process.exit(1);
        }
    }

    public get sideChainProvider(): ethers.providers.Provider {
        if (this._sideChainProvider !== undefined) return this._sideChainProvider;
        else {
            logger.error("sideChainProvider is not ready yet.");
            process.exit(1);
        }
    }

    public get sideChainId(): number {
        if (this._sideChainId !== undefined) return this._sideChainId;
        else {
            logger.error("sideChainId is not ready yet.");
            process.exit(1);
        }
    }

    public get sideChainURL(): string {
        if (this._sideChainURL !== undefined) return this._sideChainURL;
        else {
            logger.error("sideChainURL is not ready yet.");
            process.exit(1);
        }
    }

    public get sideTokenContract(): BIP20DelegatedTransfer {
        if (this._sideTokenContract !== undefined) return this._sideTokenContract;
        else {
            logger.error("sideTokenContract is not ready yet.");
            process.exit(1);
        }
    }

    public get sideLedgerContract(): Ledger {
        if (this._sideLedgerContract !== undefined) return this._sideLedgerContract;
        else {
            logger.error("sideLedgerContract is not ready yet.");
            process.exit(1);
        }
    }

    public get sidePhoneLinkerContract(): PhoneLinkCollection {
        if (this._sidePhoneLinkerContract !== undefined) return this._sidePhoneLinkerContract;
        else {
            logger.error("sidePhoneLinkerContract is not ready yet.");
            process.exit(1);
        }
    }

    public get sideCurrencyRateContract(): CurrencyRate {
        if (this._sideCurrencyRateContract !== undefined) return this._sideCurrencyRateContract;
        else {
            logger.error("sidePhoneLinkerContract is not ready yet.");
            process.exit(1);
        }
    }

    public get sideShopContract(): Shop {
        if (this._sideShopContract !== undefined) return this._sideShopContract;
        else {
            logger.error("sideShopContract is not ready yet.");
            process.exit(1);
        }
    }

    public get sideLoyaltyProviderContract(): LoyaltyProvider {
        if (this._sideLoyaltyProviderContract !== undefined) return this._sideLoyaltyProviderContract;
        else {
            logger.error("sideLoyaltyProviderContract is not ready yet.");
            process.exit(1);
        }
    }

    public get sideLoyaltyConsumerContract(): LoyaltyConsumer {
        if (this._sideLoyaltyConsumerContract !== undefined) return this._sideLoyaltyConsumerContract;
        else {
            logger.error("sideLoyaltyConsumerContract is not ready yet.");
            process.exit(1);
        }
    }

    public get sideLoyaltyExchangerContract(): LoyaltyExchanger {
        if (this._sideLoyaltyExchangerContract !== undefined) return this._sideLoyaltyExchangerContract;
        else {
            logger.error("sideLoyaltyConsumerContract is not ready yet.");
            process.exit(1);
        }
    }

    public get sideLoyaltyTransferContract(): LoyaltyTransfer {
        if (this._sideLoyaltyTransferContract !== undefined) return this._sideLoyaltyTransferContract;
        else {
            logger.error("sideLoyaltyTransferContract is not ready yet.");
            process.exit(1);
        }
    }

    public get sideLoyaltyBridgeContract(): LoyaltyBridge {
        if (this._sideLoyaltyBridgeContract !== undefined) return this._sideLoyaltyBridgeContract;
        else {
            logger.error("sideLoyaltyBridgeContract is not ready yet.");
            process.exit(1);
        }
    }

    public get sideChainBridgeContract(): Bridge {
        if (this._sideChainBridgeContract !== undefined) return this._sideChainBridgeContract;
        else {
            logger.error("sideChainBridgeContract is not ready yet.");
            process.exit(1);
        }
    }

    public get mainTokenContract(): BIP20DelegatedTransfer {
        if (this._mainTokenContract !== undefined) return this._mainTokenContract;
        else {
            logger.error("mainTokenContract is not ready yet.");
            process.exit(1);
        }
    }

    public get mainLoyaltyBridgeContract(): Bridge {
        if (this._mainLoyaltyBridgeContract !== undefined) return this._mainLoyaltyBridgeContract;
        else {
            logger.error("mainLoyaltyBridgeContract is not ready yet.");
            process.exit(1);
        }
    }

    public get mainChainBridgeContract(): Bridge {
        if (this._mainChainBridgeContract !== undefined) return this._mainChainBridgeContract;
        else {
            logger.error("mainChainBridgeContract is not ready yet.");
            process.exit(1);
        }
    }
}
