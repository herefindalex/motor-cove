# 結算和索賠流程

[English](settlement-and-claims.md) · [简体中文](settlement-and-claims.zh-CN.md)

此頁面追蹤完成、取消、到期、付款索賠和 NFT 恢復。

## 完成並退出

到期前，只有記錄的買家才能完成融資銷售。完成後將 NFT 轉移給買方並建立 `SELLER_PROCEEDS` 索賠。然後賣方在單獨的交易中調用 `withdrawPayment`。受益人授權提款；收件人可能是另一個安全地址。

## 取消並收回

只有賣家可以取消列出的銷售。取消會改變銷售狀態，但 NFT 仍處於託管狀態。賣方單獨呼叫`reclaimToken`，如果收款人拒絕NFT且未回滾之前的取消，則可以重試轉帳。

## 過期、退款和回收

在鏈上截止日期之後，任何人都可以執行到期。這將創建 `BUYER_REFUND`；它不會自動發送 ETH。買家退款提現和賣家NFT回收是獨立操作。失敗的接收方呼叫僅回滾嘗試的提款或回收交易。

## 不變數

每項資助的本金至多成為一項債權。 Claim 金額和受益人仍歸屬於出售。 `totalLiability`只有在轉帳成功後才會減少。歷史買家不會成為永久所有權來源； ERC-721 `Transfer` 事件驅動目前所有權。

請參閱[託管協議](../protocol/escrow.zh-TW.md) 和 `chain/test` 下的合約測試。
