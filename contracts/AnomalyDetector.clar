(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-TX-ID u101)
(define-constant ERR-INVALID-SCORE u102)
(define-constant ERR-INVALID-THRESHOLD u103)
(define-constant ERR-INVALID-ANOMALY-TYPE u104)
(define-constant ERR-INVALID-REASON u105)
(define-constant ERR-INVALID-TIMESTAMP u106)
(define-constant ERR-INVALID-SUBMITTER u107)
(define-constant ERR-INVALID-UPDATE u108)
(define-constant ERR-INVALID-CONFIDENCE u109)
(define-constant ERR-INVALID-MAX-FLAGS u110)
(define-constant ERR-INVALID-MIN-SCORE u111)
(define-constant ERR-INVALID-MAX-SCORE u112)
(define-constant ERR-INVALID-STATUS u113)
(define-constant ERR-INVALID-ORACLE u114)
(define-constant ERR-INVALID-GOVERNANCE u115)
(define-constant ERR-INVALID-PROPOSAL u116)
(define-constant ERR-INVALID-VOTE u117)
(define-constant ERR-FLAG-ALREADY-EXISTS u118)
(define-constant ERR-FLAG-NOT-FOUND u119)
(define-constant ERR-MAX-FLAGS-EXCEEDED u120)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u121)
(define-constant ERR-INVALID-LOCATION u122)
(define-constant ERR-INVALID-CATEGORY u123)
(define-constant ERR-INVALID-PRIORITY u124)
(define-constant ERR-INVALID-EXPIRY u125)

(define-data-var next-flag-id uint u0)
(define-data-var max-flags uint u10000)
(define-data-var submission-fee uint u500)
(define-data-var anomaly-threshold uint u80)
(define-data-var min-score uint u0)
(define-data-var max-score uint u100)
(define-data-var authority-contract (optional principal) none)
(define-data-var oracle-principal (optional principal) none)

(define-map flags
  uint
  {
    tx-id: (string-ascii 64),
    score: uint,
    flagged: bool,
    anomaly-type: (string-ascii 50),
    reason: (string-utf8 200),
    timestamp: uint,
    submitter: principal,
    confidence: uint,
    status: bool,
    location: (string-ascii 100),
    category: (string-ascii 50),
    priority: uint,
    expiry: uint
  }
)

(define-map flags-by-tx-id
  (string-ascii 64)
  uint
)

(define-map flag-updates
  uint
  {
    update-score: uint,
    update-flagged: bool,
    update-reason: (string-utf8 200),
    update-timestamp: uint,
    updater: principal
  }
)

(define-map governance-proposals
  uint
  {
    desc: (string-utf8 200),
    new-threshold: uint,
    yes-votes: uint,
    no-votes: uint,
    expiry: uint,
    proposer: principal
  }
)

(define-data-var next-proposal-id uint u0)

(define-read-only (get-flag (id uint))
  (map-get? flags id)
)

(define-read-only (get-flag-by-tx-id (tx-id (string-ascii 64)))
  (let ((id (map-get? flags-by-tx-id tx-id)))
    (match id flag-id (get-flag flag-id) none)
  )
)

(define-read-only (get-flag-updates (id uint))
  (map-get? flag-updates id)
)

(define-read-only (is-flag-registered (tx-id (string-ascii 64)))
  (is-some (map-get? flags-by-tx-id tx-id))
)

(define-read-only (get-anomaly-threshold)
  (ok (var-get anomaly-threshold))
)

(define-read-only (get-proposal (id uint))
  (map-get? governance-proposals id)
)

(define-private (validate-tx-id (tx-id (string-ascii 64)))
  (if (and (> (len tx-id) u0) (<= (len tx-id) u64))
    (ok true)
    (err ERR-INVALID-TX-ID)
  )
)

(define-private (validate-score (score uint))
  (let ((min (var-get min-score)) (max (var-get max-score)))
    (if (and (>= score min) (<= score max))
      (ok true)
      (err ERR-INVALID-SCORE)
    )
  )
)

(define-private (validate-threshold (threshold uint))
  (if (and (> threshold u0) (<= threshold u100))
    (ok true)
    (err ERR-INVALID-THRESHOLD)
  )
)

(define-private (validate-anomaly-type (atype (string-ascii 50)))
  (if (or (is-eq atype "fraud") (is-eq atype "laundering") (is-eq atype "exploit") (is-eq atype "wash-trading"))
    (ok true)
    (err ERR-INVALID-ANOMALY-TYPE)
  )
)

(define-private (validate-reason (reason (string-utf8 200)))
  (if (<= (len reason) u200)
    (ok true)
    (err ERR-INVALID-REASON)
  )
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
    (ok true)
    (err ERR-INVALID-TIMESTAMP)
  )
)

(define-private (validate-confidence (conf uint))
  (if (<= conf u100)
    (ok true)
    (err ERR-INVALID-CONFIDENCE)
  )
)

(define-private (validate-location (loc (string-ascii 100)))
  (if (<= (len loc) u100)
    (ok true)
    (err ERR-INVALID-LOCATION)
  )
)

(define-private (validate-category (cat (string-ascii 50)))
  (if (or (is-eq cat "defi") (is-eq cat "nft") (is-eq cat "dao") (is-eq cat "general"))
    (ok true)
    (err ERR-INVALID-CATEGORY)
  )
)

(define-private (validate-priority (pri uint))
  (if (<= pri u10)
    (ok true)
    (err ERR-INVALID-PRIORITY)
  )
)

(define-private (validate-expiry (exp uint))
  (if (> exp block-height)
    (ok true)
    (err ERR-INVALID-EXPIRY)
  )
)

(define-private (validate-submitter (sub principal))
  (match (var-get oracle-principal)
    oracle (if (is-eq sub oracle) (ok true) (err ERR-INVALID-SUBMITTER))
    (err ERR-INVALID-ORACLE)
  )
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p tx-sender))
    (ok true)
    (err ERR-NOT-AUTHORIZED)
  )
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-oracle-principal (oracle principal))
  (begin
    (try! (validate-principal oracle))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set oracle-principal (some oracle))
    (ok true)
  )
)

(define-public (set-anomaly-threshold (new-threshold uint))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (try! (validate-threshold new-threshold))
    (var-set anomaly-threshold new-threshold)
    (ok true)
  )
)

(define-public (set-max-flags (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-MAX-FLAGS))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-flags new-max)
    (ok true)
  )
)

(define-public (set-submission-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID_UPDATE))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set submission-fee new-fee)
    (ok true)
  )
)

(define-public (submit-flag
  (tx-id (string-ascii 64))
  (score uint)
  (anomaly-type (string-ascii 50))
  (reason (string-utf8 200))
  (confidence uint)
  (location (string-ascii 100))
  (category (string-ascii 50))
  (priority uint)
  (expiry uint)
  )
  (let (
    (next-id (var-get next-flag-id))
    (current-max (var-get max-flags))
    (authority (var-get authority-contract))
    (threshold (var-get anomaly-threshold))
    (flagged (> score threshold))
  )
    (asserts! (< next-id current-max) (err ERR-MAX-FLAGS-EXCEEDED))
    (try! (validate-tx-id tx-id))
    (try! (validate-score score))
    (try! (validate-anomaly-type anomaly-type))
    (try! (validate-reason reason))
    (try! (validate-confidence confidence))
    (try! (validate-location location))
    (try! (validate-category category))
    (try! (validate-priority priority))
    (try! (validate-expiry expiry))
    (try! (validate-submitter tx-sender))
    (asserts! (is-none (map-get? flags-by-tx-id tx-id)) (err ERR-FLAG-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get submission-fee) tx-sender authority-recipient))
    )
    (map-set flags next-id
      {
        tx-id: tx-id,
        score: score,
        flagged: flagged,
        anomaly-type: anomaly-type,
        reason: reason,
        timestamp: block-height,
        submitter: tx-sender,
        confidence: confidence,
        status: true,
        location: location,
        category: category,
        priority: priority,
        expiry: expiry
      }
    )
    (map-set flags-by-tx-id tx-id next-id)
    (var-set next-flag-id (+ next-id u1))
    (print { event: "flag-submitted", id: next-id, flagged: flagged })
    (ok next-id)
  )
)

(define-public (update-flag
  (flag-id uint)
  (update-score uint)
  (update-reason (string-utf8 200))
  )
  (let ((flag (map-get? flags flag-id)))
    (match flag
      f
      (begin
        (asserts! (is-eq (get submitter f) tx-sender) (err ERR-NOT-AUTHORIZED))
        (try! (validate-score update-score))
        (try! (validate-reason update-reason))
        (let ((threshold (var-get anomaly-threshold)))
          (let ((update-flagged (> update-score threshold)))
            (map-set flags flag-id
              {
                tx-id: (get tx-id f),
                score: update-score,
                flagged: update-flagged,
                anomaly-type: (get anomaly-type f),
                reason: update-reason,
                timestamp: block-height,
                submitter: (get submitter f),
                confidence: (get confidence f),
                status: (get status f),
                location: (get location f),
                category: (get category f),
                priority: (get priority f),
                expiry: (get expiry f)
              }
            )
            (map-set flag-updates flag-id
              {
                update-score: update-score,
                update-flagged: update-flagged,
                update-reason: update-reason,
                update-timestamp: block-height,
                updater: tx-sender
              }
            )
            (print { event: "flag-updated", id: flag-id })
            (ok true)
          )
        )
      )
      (err ERR-FLAG-NOT-FOUND)
    )
  )
)

(define-public (create-proposal (desc (string-utf8 200)) (new-threshold uint) (expiry uint))
  (let ((next-id (var-get next-proposal-id)))
    (try! (validate-reason desc))
    (try! (validate-threshold new-threshold))
    (try! (validate-expiry expiry))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (map-set governance-proposals next-id
      {
        desc: desc,
        new-threshold: new-threshold,
        yes-votes: u0,
        no-votes: u0,
        expiry: expiry,
        proposer: tx-sender
      }
    )
    (var-set next-proposal-id (+ next-id u1))
    (print { event: "proposal-created", id: next-id })
    (ok next-id)
  )
)

(define-public (vote-on-proposal (prop-id uint) (support bool))
  (let ((prop (map-get? governance-proposals prop-id)))
    (match prop
      p
      (begin
        (asserts! (< block-height (get expiry p)) (err ERR-INVALID-EXPIRY))
        (asserts! (is-some (var-get oracle-principal)) (err ERR-INVALID-ORACLE))
        (if support
          (map-set governance-proposals prop-id
            (merge p { yes-votes: (+ (get yes-votes p) u1) })
          )
          (map-set governance-proposals prop-id
            (merge p { no-votes: (+ (get no-votes p) u1) })
          )
        )
        (let ((yes (get yes-votes p)) (no (get no-votes p)))
          (if (> yes (+ no u10))
            (begin
              (var-set anomaly-threshold (get new-threshold p))
              (print { event: "threshold-updated", new: (get new-threshold p) })
            )
            (ok false)
          )
        )
        (ok true)
      )
      (err ERR-INVALID-PROPOSAL)
    )
  )
)

(define-public (get-flag-count)
  (ok (var-get next-flag-id))
)

(define-public (check-flag-existence (tx-id (string-ascii 64)))
  (ok (is-flag-registered tx-id))
)