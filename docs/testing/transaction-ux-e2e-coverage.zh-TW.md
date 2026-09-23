# 交易介面的瀏覽器測試涵蓋範圍

本矩陣將交易介面狀態對應到可執行的檢查。瀏覽器測試位於
`tests/e2e/marketplace.spec.ts`，使用測試環境專屬的 Anvil、合成帳戶，以及實際的 API、
Indexer 與 Web 應用程式。測試不使用真實錢包或公開鏈。

`asset-approval-state.test.ts`、`use-token-approvals.test.tsx` 和 `MyAssets.test.tsx`
涵蓋核准模型與元件；`SubmissionNotice.test.tsx` 和 `TransactionTimeline.test.tsx`
涵蓋交易訊息。破折號表示該層沒有專屬斷言，不表示產品沒有該行為。

| 介面狀態或操作流程                       | 單元 | 元件 |       E2E        | 瀏覽器證據與邊界                                                                                 |
| ---------------------------------------- | :--: | :--: | :--------------: | ------------------------------------------------------------------------------------------------ |
| 尚未核准，無法上架                       |  有  |  有  |        有        | `keeps listing gated`：檢查兩個操作的狀態與可見訊息。                                            |
| 準備核准                                 |  —   |  —   |        有        | `keeps listing gated`：暫停核准模擬；此時尚未送出錢包請求。                                      |
| 等待錢包核准                             |  有  |  —   |        有        | `keeps listing gated`：測試錢包暫停回應；操作顯示忙碌且仍無法上架。                              |
| 核准已送出、尚未入塊                     |  有  |  有  |        有        | `keeps listing gated`：暫停 Anvil 自動出塊，檢查時間線與上架限制。                               |
| 已入塊、權限尚未確認                     |  有  |  有  |        有        | `keeps listing gated`：先將收據入塊，再暫停核准讀取；上架仍停用。                                |
| 鏈上核准已確認                           |  有  |  有  |        有        | `keeps listing gated`：恢復鏈上讀取後可上架，並實際建立 Sale。                                   |
| 核准讀取不可用                           |  有  |  有  |        有        | `fails closed`：受控 RPC 錯誤、操作停用，且沒有錢包提交。                                        |
| 鏈上持有人與索引資料不同                 |  有  |  —   |        有        | `blocks listing`：受控 `ownerOf` 回應，操作停用。                                                |
| 錢包拒絕                                 |  —   |  有  |        有        | `surfaces network and rejection`：持久化狀態提示與時間線語意。                                   |
| 錢包結果未知                             |  —   |  有  |        有        | 同一測試：警示與時間線語意；候選雜湊恢復不會提交交易。                                           |
| 已提交但 journal 寫入失敗                |  —   |  有  |        有        | `lists, expires, refunds, and reclaims`：警告、雜湊、站內導覽與重新載入限制。                    |
| 投影仍在追趕、觀察結果有效               |  —   |  —   |        有        | `keeps pending and included evidence`：真實收據與落後的 Sale 回應，搭配受控的有效 API 健康狀態。 |
| 投影觀察不可用                           |  —   |  —   |        有        | 同一測試：停止 Indexer，並由實際 API 回報過期觀察。                                              |
| 需要恢復                                 |  —   |  —   | 有，使用 fixture | 同一測試：真實收據與落後的 Sale 回應，搭配受控的 API 恢復狀態；未觸發完整 Indexer 恢復。         |
| 載入中與空資料的區別                     |  —   |  有  |        有        | `shows loading`：暫停 Sale 與車輛 API 回應；可存取的載入狀態先於內容出現。                       |
| 時間線對已送出、已入塊、拒絕、未知的說明 |  —   |  有  |        有        | 核准、投影與遺失回應流程同時檢查原始狀態與使用者可讀文字。                                       |
| 核准操作忙碌狀態與重複點擊防護           |  —   |  有  |        有        | `keeps listing gated`：停用、`aria-busy` 與錢包提交次數；付款忙碌狀態目前只有元件測試。          |
| 站內導覽保留暫存交易雜湊                 |  —   |  有  |        有        | `lists, expires, refunds, and reclaims`：路由、時間線雜湊與提交次數不變。                        |
| 窄螢幕資產版面                           |  —   |  —   |        有        | `fails closed` 以 390 px 視窗檢查價格輸入與兩個操作仍可見。                                      |

受控 RPC 與 API 回應會經過真正的瀏覽器畫面，不直接修改 React 狀態。「需要恢復」案例
只驗證呈現；恢復行為由另外的資料庫與 Indexer 測試涵蓋。瀏覽器檢查等待具體狀態，
不使用固定時間的 sleep。
