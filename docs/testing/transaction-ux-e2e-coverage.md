# Transaction UX browser coverage

This matrix maps the transaction UX states to executable checks. The browser checks live in
`tests/e2e/marketplace.spec.ts` and use a harness-owned Anvil, synthetic accounts, the real API,
Indexer, and Web app. They do not exercise a real wallet or public chain.

`asset-approval-state.test.ts`, `use-token-approvals.test.tsx`, and
`MyAssets.test.tsx` cover the approval model and component. `SubmissionNotice.test.tsx` and
`TransactionTimeline.test.tsx` cover the transaction messages. A dash means there is no dedicated
assertion at that layer; it does not imply that the behavior is absent.

| UX state or journey                                          | Unit | Component |     E2E      | Browser evidence and boundary                                                                                             |
| ------------------------------------------------------------ | :--: | :-------: | :----------: | ------------------------------------------------------------------------------------------------------------------------- |
| Not approved; listing disabled                               | Yes  |    Yes    |     Yes      | `keeps listing gated`: both action states and visible message.                                                            |
| Preparing approval                                           |  —   |     —     |     Yes      | `keeps listing gated`: approval simulation is held; no wallet submission yet.                                             |
| Awaiting wallet approval                                     | Yes  |     —     |     Yes      | `keeps listing gated`: test wallet holds its response; action is busy and listing remains disabled.                       |
| Approval submitted, not included                             | Yes  |    Yes    |     Yes      | `keeps listing gated`: Anvil automining is paused; timeline and listing gate are asserted.                                |
| Included, permission not yet confirmed                       | Yes  |    Yes    |     Yes      | `keeps listing gated`: receipt is mined while approval reads are held; listing remains disabled.                          |
| On-chain approval confirmed                                  | Yes  |    Yes    |     Yes      | `keeps listing gated`: released chain read enables listing, then a sale is created.                                       |
| Approval read unavailable                                    | Yes  |    Yes    |     Yes      | `fails closed`: controlled RPC error, disabled actions, no wallet submission.                                             |
| Chain owner differs from indexed owner                       | Yes  |     —     |     Yes      | `blocks listing`: controlled `ownerOf` response, disabled actions.                                                        |
| Wallet rejection                                             |  —   |    Yes    |     Yes      | `surfaces network and rejection`: durable status notice and timeline meaning.                                             |
| Unknown wallet outcome                                       |  —   |    Yes    |     Yes      | Same test: alert and timeline meaning; candidate-hash recovery makes no wallet submission.                                |
| Submitted but journal write failed                           |  —   |    Yes    |     Yes      | `lists, expires, refunds, and reclaims`: warning, hash, client navigation, and reload limit.                              |
| Fresh projection still catching up                           |  —   |     —     |     Yes      | `keeps pending and included evidence`: real receipt and lagging sales; controlled fresh API health response.              |
| Projection observation unavailable                           |  —   |     —     |     Yes      | Same test: Indexer is stopped and the live API reports stale observation.                                                 |
| Recovery required                                            |  —   |     —     | Yes, fixture | Same test: real receipt and lagging sales with a controlled API recovery status. No full Indexer recovery is induced.     |
| Loading versus empty                                         |  —   |    Yes    |     Yes      | `shows loading`: sales and vehicle API responses are held; accessible loading status precedes content.                    |
| Timeline meanings for submitted, included, rejected, unknown |  —   |    Yes    |     Yes      | Approval, projection, and lost-response browser journeys assert raw and user-facing text.                                 |
| Busy approval action and duplicate-click guard               |  —   |    Yes    |     Yes      | `keeps listing gated`: disabled, `aria-busy`, and wallet submission count. Funding busy state remains at component level. |
| Client navigation preserves volatile transaction hash        |  —   |    Yes    |     Yes      | `lists, expires, refunds, and reclaims`: route, timeline hash, and unchanged submission count.                            |
| Narrow asset layout                                          |  —   |     —     |     Yes      | `fails closed` runs at a 390 px viewport and checks price input and both actions remain visible.                          |

The controlled RPC and API responses exercise the actual browser surfaces without mutating React
state. The recovery-required case verifies presentation only; recovery behavior is covered by the
separate database and Indexer tests. Browser checks use semantic conditions rather than fixed
sleep intervals.
