// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "../interfaces/IPhoneLinkCollection.sol";

import "../interfaces/ICurrencyRate.sol";
import "../interfaces/IShop.sol";
import "../interfaces/ILedger.sol";
import "./LoyaltyConsumerStorage.sol";

import "../lib/DMS.sol";

contract LoyaltyConsumer is LoyaltyConsumerStorage, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    struct LoyaltyPaymentInputData {
        bytes32 paymentId;
        string purchaseId;
        uint256 amount;
        string currency;
        bytes32 shopId;
        address account;
        bytes signature;
        bytes32 secretLock;
    }

    /// @notice 토큰/포인트로 지불을 완료했을 때 발생하는 이벤트
    event LoyaltyPaymentEvent(LoyaltyPaymentData payment, uint256 balance);

    function initialize(address _currencyRateAddress) external initializer {
        __UUPSUpgradeable_init();
        __Ownable_init_unchained();

        currencyRateContract = ICurrencyRate(_currencyRateAddress);
        isSetLedger = false;
        isSetShop = false;
        temporaryAddress = address(0x0);
    }

    /// @notice 원장 컨트랙트를 등록한다.
    function setLedger(address _contractAddress) public {
        require(_msgSender() == owner(), "1050");
        if (!isSetLedger) {
            ledgerContract = ILedger(_contractAddress);
            systemAccount = ledgerContract.getSystemAccount();
            isSetLedger = true;
        }
    }

    /// @notice 상점 컨트랙트를 등록한다.
    function setShop(address _contractAddress) public {
        require(_msgSender() == owner(), "1050");
        if (!isSetShop) {
            shopContract = IShop(_contractAddress);
            isSetShop = true;
        }
    }

    function _authorizeUpgrade(address newImplementation) internal virtual override {
        require(_msgSender() == owner(), "Unauthorized access");
    }

    /// @notice 로얄티(포인트/토큰)을 사용하여 구매요청을 시작하는 함수
    /// @dev 중계서버를 통해서 호출됩니다.
    function openNewLoyaltyPayment(LoyaltyPaymentInputData calldata data) external {
        require(loyaltyPayments[data.paymentId].status == LoyaltyPaymentStatus.INVALID, "1530");

        bytes32 dataHash = keccak256(
            abi.encode(
                data.paymentId,
                data.purchaseId,
                data.amount,
                data.currency,
                data.shopId,
                data.account,
                block.chainid,
                ledgerContract.nonceOf(data.account)
            )
        );
        require(ECDSA.recover(ECDSA.toEthSignedMessageHash(dataHash), data.signature) == data.account, "1501");

        ledgerContract.increaseNonce(data.account);

        _openNewLoyaltyPaymentPoint(data);
    }

    /// @notice 포인트를 사용한 구매요청을 시작하는 함수
    function _openNewLoyaltyPaymentPoint(LoyaltyPaymentInputData memory data) internal {
        uint256 paidPoint = currencyRateContract.convertCurrencyToPoint(data.amount, data.currency);
        uint256 paidToken = currencyRateContract.convertPointToToken(paidPoint);
        uint256 feeValue = DMS.zeroGWEI((data.amount * ledgerContract.getPaymentFee()) / 10000);
        uint256 feePoint = currencyRateContract.convertCurrencyToPoint(feeValue, data.currency);
        uint256 feeToken = currencyRateContract.convertPointToToken(feePoint);

        require(ledgerContract.pointBalanceOf(data.account) >= (paidPoint + feePoint), "1511");

        ledgerContract.subPointBalance(data.account, paidPoint + feePoint);
        ledgerContract.addPointBalance(temporaryAddress, paidPoint + feePoint);

        loyaltyPayments[data.paymentId] = LoyaltyPaymentData({
            paymentId: data.paymentId,
            purchaseId: data.purchaseId,
            currency: data.currency,
            shopId: data.shopId,
            account: data.account,
            secretLock: data.secretLock,
            timestamp: block.timestamp,
            paidPoint: paidPoint,
            paidToken: paidToken,
            paidValue: data.amount,
            feePoint: feePoint,
            feeToken: feeToken,
            feeValue: feeValue,
            usedValueShop: 0,
            status: LoyaltyPaymentStatus.OPENED_PAYMENT
        });

        emit LoyaltyPaymentEvent(loyaltyPayments[data.paymentId], ledgerContract.pointBalanceOf(data.account));
    }

    /// @notice 로얄티(포인트/토큰)을 사용하여 구매요청을 종료 함수
    /// @dev 중계서버를 통해서 호출됩니다.
    function closeNewLoyaltyPayment(bytes32 _paymentId, bytes32 _secret, bool _confirm) external {
        require(loyaltyPayments[_paymentId].status == LoyaltyPaymentStatus.OPENED_PAYMENT, "1531");
        require(loyaltyPayments[_paymentId].secretLock == keccak256(abi.encode(_secret)), "1505");

        uint256 totalPoint = loyaltyPayments[_paymentId].paidPoint + loyaltyPayments[_paymentId].feePoint;
        if (_confirm) {
            // 임시저장 포인트를 소각한다.
            ledgerContract.subPointBalance(temporaryAddress, totalPoint);

            // 시스템의 토큰으로 교환해 수수료계좌에 지급한다.
            if (ledgerContract.tokenBalanceOf(systemAccount) >= loyaltyPayments[_paymentId].feeToken) {
                ledgerContract.subTokenBalance(systemAccount, loyaltyPayments[_paymentId].feeToken);
                ledgerContract.addTokenBalance(
                    ledgerContract.getPaymentFeeAccount(),
                    loyaltyPayments[_paymentId].feeToken
                );
            }
            IShop.ShopData memory shop = shopContract.shopOf(loyaltyPayments[_paymentId].shopId);
            if (shop.status == IShop.ShopStatus.ACTIVE) {
                loyaltyPayments[_paymentId].usedValueShop = currencyRateContract.convertCurrency(
                    loyaltyPayments[_paymentId].paidValue,
                    loyaltyPayments[_paymentId].currency,
                    shop.currency
                );
                shopContract.addUsedAmount(
                    loyaltyPayments[_paymentId].shopId,
                    loyaltyPayments[_paymentId].usedValueShop,
                    loyaltyPayments[_paymentId].purchaseId,
                    _paymentId
                );
            }
            loyaltyPayments[_paymentId].status = LoyaltyPaymentStatus.CLOSED_PAYMENT;
        } else {
            // 임시저장 포인트를 소각한다.
            ledgerContract.subPointBalance(temporaryAddress, totalPoint);
            // 사용자에게 포인트를 반환한다
            ledgerContract.addPointBalance(loyaltyPayments[_paymentId].account, totalPoint);
            loyaltyPayments[_paymentId].status = LoyaltyPaymentStatus.FAILED_PAYMENT;
        }
        emit LoyaltyPaymentEvent(
            loyaltyPayments[_paymentId],
            ledgerContract.pointBalanceOf(loyaltyPayments[_paymentId].account)
        );
    }

    /// @notice 로얄티(포인트/토큰)을 사용한 구매에 대하여 취소를 시작하는 함수
    /// @dev 상점주가 중계서버를 통해서 호출됩니다.
    function openCancelLoyaltyPayment(bytes32 _paymentId, bytes32 _secretLock, bytes calldata _signature) external {
        require(
            (loyaltyPayments[_paymentId].status != LoyaltyPaymentStatus.CLOSED_PAYMENT) ||
                (loyaltyPayments[_paymentId].status != LoyaltyPaymentStatus.FAILED_CANCEL),
            "1532"
        );
        require(block.timestamp <= loyaltyPayments[_paymentId].timestamp + 86400 * 7, "1534");

        IShop.ShopData memory shopInfo = shopContract.shopOf(loyaltyPayments[_paymentId].shopId);
        bool pass1 = false;
        bool pass2 = false;
        bytes32 dataHash1 = keccak256(
            abi.encode(
                _paymentId,
                loyaltyPayments[_paymentId].purchaseId,
                shopInfo.account,
                block.chainid,
                ledgerContract.nonceOf(shopInfo.account)
            )
        );
        pass1 = ECDSA.recover(ECDSA.toEthSignedMessageHash(dataHash1), _signature) == shopInfo.account;

        if (shopInfo.delegator != address(0x0)) {
            bytes32 dataHash2 = keccak256(
                abi.encode(
                    _paymentId,
                    loyaltyPayments[_paymentId].purchaseId,
                    shopInfo.delegator,
                    block.chainid,
                    ledgerContract.nonceOf(shopInfo.delegator)
                )
            );
            pass2 = ECDSA.recover(ECDSA.toEthSignedMessageHash(dataHash2), _signature) == shopInfo.delegator;
        }
        require(pass1 || pass2, "1501");

        ledgerContract.increaseNonce(shopInfo.account);

        if (
            ledgerContract.tokenBalanceOf(ledgerContract.getPaymentFeeAccount()) >= loyaltyPayments[_paymentId].feeToken
        ) {
            ledgerContract.transferToken(
                ledgerContract.getPaymentFeeAccount(),
                temporaryAddress,
                loyaltyPayments[_paymentId].feeToken
            );
            ledgerContract.addPointBalance(
                temporaryAddress,
                loyaltyPayments[_paymentId].paidPoint + loyaltyPayments[_paymentId].feePoint
            );

            loyaltyPayments[_paymentId].secretLock = _secretLock;
            loyaltyPayments[_paymentId].status = LoyaltyPaymentStatus.OPENED_CANCEL;
            emit LoyaltyPaymentEvent(
                loyaltyPayments[_paymentId],
                ledgerContract.pointBalanceOf(loyaltyPayments[_paymentId].account)
            );
        } else {
            revert("1513");
        }
    }

    /// @notice 로얄티(포인트/토큰)을 사용한 구매에 대하여 취소를 종료하는 함수
    /// @dev 사용자가 중계서버를 통해서 호출됩니다.
    function closeCancelLoyaltyPayment(bytes32 _paymentId, bytes32 _secret, bool _confirm) external {
        require(loyaltyPayments[_paymentId].status == LoyaltyPaymentStatus.OPENED_CANCEL, "1533");
        require(loyaltyPayments[_paymentId].secretLock == keccak256(abi.encode(_secret)), "1505");

        uint256 balance;
        if (_confirm) {
            ledgerContract.transferToken(temporaryAddress, systemAccount, loyaltyPayments[_paymentId].feeToken);
            ledgerContract.addPointBalance(
                loyaltyPayments[_paymentId].account,
                loyaltyPayments[_paymentId].paidPoint + loyaltyPayments[_paymentId].feePoint
            );

            balance = ledgerContract.pointBalanceOf(loyaltyPayments[_paymentId].account);
            shopContract.subUsedAmount(
                loyaltyPayments[_paymentId].shopId,
                loyaltyPayments[_paymentId].usedValueShop,
                loyaltyPayments[_paymentId].purchaseId,
                _paymentId
            );
            loyaltyPayments[_paymentId].status = LoyaltyPaymentStatus.CLOSED_CANCEL;
            emit LoyaltyPaymentEvent(loyaltyPayments[_paymentId], balance);
        } else {
            ledgerContract.transferToken(
                temporaryAddress,
                ledgerContract.getPaymentFeeAccount(),
                loyaltyPayments[_paymentId].feeToken
            );
            ledgerContract.subPointBalance(
                temporaryAddress,
                loyaltyPayments[_paymentId].paidPoint + loyaltyPayments[_paymentId].feePoint
            );
            balance = ledgerContract.pointBalanceOf(loyaltyPayments[_paymentId].account);
            loyaltyPayments[_paymentId].status = LoyaltyPaymentStatus.FAILED_CANCEL;
            emit LoyaltyPaymentEvent(loyaltyPayments[_paymentId], balance);
        }
    }

    /// @notice 로얄티(포인트/토큰)을 구매데아타를 제공하는 함수
    /// @param _paymentId 지불 아이디
    function loyaltyPaymentOf(bytes32 _paymentId) external view returns (LoyaltyPaymentData memory) {
        return loyaltyPayments[_paymentId];
    }

    /// @notice 이용할 수 있는 지불 아이디 인지 알려준다.
    /// @param _paymentId 지불 아이디
    function isAvailablePaymentId(bytes32 _paymentId) external view returns (bool) {
        if (loyaltyPayments[_paymentId].status == LoyaltyPaymentStatus.INVALID) return true;
        else return false;
    }
}
