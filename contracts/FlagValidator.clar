;; contracts/flag-validator.clar
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-STAKE u101)
(define-constant ERR-INVALID-FLAG-ID u102)
(define-constant ERR-FLAG-NOT-FOUND u103)
(define-constant ERR-ALREADY-VOTED u104)
(define-constant ERR-INSUFFICIENT-STAKE u105)
(define-constant ERR-VOTING-CLOSED u106)
(define-constant ERR-SLASH-FAILED u107)
(define-constant ERR-REWARD-FAILED u108)
(define-constant ERR-INVALID-THRESHOLD u109)
(define-constant ERR-FLAG-EXPIRED u110)
(define-constant ERR-FLAG-NOT-EXPIRED u111)
(define-constant ERR-INVALID-STATUS u112)
(define-constant ERR-MIN-STAKE-VIOLATION u113)

(define-constant VOTING-DURATION u144)
(define-constant MIN-STAKE u1000000)
(define-constant CONSENSUS-THRESHOLD u66)
(define-constant SLASH-PERCENTAGE u20)
(define-constant REWARD-PER-FLAG u500000)

(define-data-var next-flag-id uint u0)
(define-data-var consensus-threshold uint CONSENSUS-THRESHOLD)
(define-data-var voting-duration uint VOTING-DURATION)
(define-data-var min-stake-amount uint MIN-STAKE)

(define-map flags
  uint
  {
    tx-id: (string-ascii 64),
    anomaly-score: uint,
    submitter: principal,
    created-at: uint,
    expires-at: uint,
    status: (string-ascii 10),
    yes-votes: uint,
    no-votes: uint,
    total-staked: uint
  }
)

(define-map validator-stakes
  { flag-id: uint, validator: principal }
  { stake: uint, vote: (optional bool) }
)

(define-map validator-total-stake principal uint)

(define-read-only (get-flag (flag-id uint))
  (map-get? flags flag-id)
)

(define-read-only (get-validator-stake (flag-id uint) (validator principal))
  (map-get? validator-stakes { flag-id: flag-id, validator: validator })
)

(define-read-only (get-total-validator-stake (validator principal))
  (default-to u0 (map-get? validator-total-stake validator))
)

(define-read-only (is-flag-expired (flag-id uint))
  (match (map-get? flags flag-id)
    flag (> block-height (get expires-at flag))
    false
  )
)

(define-read-only (calculate-consensus (flag-id uint))
  (match (map-get? flags flag-id)
    flag
      (let (
        (yes (get yes-votes flag))
        (no (get no-votes flag))
        (total (+ yes no))
      )
        (if (> total u0)
          (some (>= (* yes u100) (* total (var-get consensus-threshold))))
          none
        )
      )
    none
  )
)

(define-private (validate-stake-amount (amount uint))
  (if (>= amount (var-get min-stake-amount))
    (ok true)
    (err ERR-MIN-STAKE-VIOLATION))
)

(define-private (validate-flag-exists (flag-id uint))
  (match (map-get? flags flag-id)
    flag (ok flag)
    (err ERR-FLAG-NOT-FOUND)
  )
)

(define-private (validate-voting-open (flag-id uint))
  (let ((flag (unwrap! (map-get? flags flag-id) (err ERR-FLAG-NOT-FOUND))))
    (if (<= block-height (get expires-at flag))
      (ok true)
      (err ERR-VOTING-CLOSED))
  )
)

(define-private (validate-not-voted (flag-id uint) (validator principal))
  (match (map-get? validator-stakes { flag-id: flag-id, validator: validator })
    stake (if (is-some (get vote stake))
      (err ERR-ALREADY-VOTED)
      (ok true)
    )
    (ok true)
  )
)

(define-public (submit-flag (tx-id (string-ascii 64)) (anomaly-score uint))
  (let (
    (flag-id (var-get next-flag-id))
    (expires-at (+ block-height (var-get voting-duration)))
  )
    (asserts! (and (>= anomaly-score u0) (<= anomaly-score u100)) (err ERR-INVALID-STATUS))
    (map-set flags flag-id
      {
        tx-id: tx-id,
        anomaly-score: anomaly-score,
        submitter: tx-sender,
        created-at: block-height,
        expires-at: expires-at,
        status: "pending",
        yes-votes: u0,
        no-votes: u0,
        total-staked: u0
      }
    )
    (var-set next-flag-id (+ flag-id u1))
    (print { event: "flag-submitted", flag-id: flag-id, tx-id: tx-id })
    (ok flag-id)
  )
)

(define-public (stake-and-vote (flag-id uint) (vote bool) (stake-amount uint))
  (let (
    (flag (try! (validate-flag-exists flag-id)))
    (current-stake-entry (map-get? validator-stakes { flag-id: flag-id, validator: tx-sender }))
  )
    (try! (validate-voting-open flag-id))
    (try! (validate-stake-amount stake-amount))
    (try! (validate-not-voted flag-id tx-sender))
    (try! (stx-transfer? stake-amount tx-sender (as-contract tx-sender)))
    (match current-stake-entry
      entry
        (let ((new-stake (+ (get stake entry) stake-amount)))
          (map-set validator-stakes
            { flag-id: flag-id, validator: tx-sender }
            { stake: new-stake, vote: (some vote) }
          )
          (map-set validator-total-stake tx-sender
            (+ (default-to u0 (map-get? validator-total-stake tx-sender)) stake-amount)
          )
          (map-set flags flag-id
            (merge flag
              {
                total-staked: (+ (get total-staked flag) stake-amount),
                yes-votes: (if vote (+ (get yes-votes flag) stake-amount) (get yes-votes flag)),
                no-votes: (if vote (get no-votes flag) (+ (get no-votes flag) stake-amount))
              }
            )
          )
          (ok new-stake)
        )
      (begin
        (map-set validator-stakes
          { flag-id: flag-id, validator: tx-sender }
          { stake: stake-amount, vote: (some vote) }
        )
        (map-set validator-total-stake tx-sender
          (+ (default-to u0 (map-get? validator-total-stake tx-sender)) stake-amount)
        )
        (map-set flags flag-id
          (merge flag
            {
              total-staked: (+ (get total-staked flag) stake-amount),
              yes-votes: (if vote (+ (get yes-votes flag) stake-amount) (get yes-votes flag)),
              no-votes: (if vote (get no-votes flag) (+ (get no-votes flag) stake-amount))
            }
          )
        )
        (ok stake-amount)
      )
    )
  )
)

(define-public (finalize-flag (flag-id uint))
  (let (
    (flag (try! (validate-flag-exists flag-id)))
    (is-expired (is-flag-expired flag-id))
  )
    (asserts! is-expired (err ERR-FLAG-NOT-EXPIRED))
    (match (calculate-consensus flag-id)
      consensus-reached
        (let (
          (final-status (if consensus-reached "confirmed" "dismissed"))
          (updated-flag (merge flag { status: final-status }))
        )
          (map-set flags flag-id updated-flag)
          (try! (distribute-rewards-or-slash flag-id consensus-reached))
          (print { event: "flag-finalized", flag-id: flag-id, status: final-status })
          (ok final-status)
        )
      (ok "insufficient-votes")
    )
  )
)

(define-private (distribute-rewards-or-slash (flag-id uint) (consensus-yes bool))
  (let (
    (flag (unwrap! (map-get? flags flag-id) (err ERR-FLAG-NOT-FOUND)))
  )
    (fold distribute-to-validator
      (map-get-entries validator-stakes flag-id)
      (ok true)
    )
  )
)

(define-private (distribute-to-validator
  (entry { key: { flag-id: uint, validator: principal }, value: { stake: uint, vote: (optional bool) } })
  (prev (response bool uint))
)
  (let (
    (validator (get validator (get key entry)))
    (stake (get stake (get value entry)))
    (vote (get vote (get value entry)))
    (flag (unwrap! (map-get? flags (get flag-id (get key entry))) (err ERR-FLAG-NOT-FOUND)))
    (consensus-yes (>= (* (get yes-votes flag) u100) (* (+ (get yes-votes flag) (get no-votes flag)) (var-get consensus-threshold))))
  )
    (match vote
      v
        (let (
          (correct-vote (is-eq v consensus-yes))
          (amount (if correct-vote
                      (+ stake REWARD-PER-FLAG)
                      (- stake (/ (* stake SLASH-PERCENTAGE) u100))
                    ))
        )
          (if correct-vote
            (try! (as-contract (stx-transfer? amount tx-sender validator)))
            (if (> amount u0)
              true
              (try! (as-contract (stx-transfer? amount tx-sender validator)))
            )
          )
          (map-delete validator-stakes { flag-id: (get flag-id (get key entry)), validator: validator })
          (map-set validator-total-stake validator
            (- (default-to u0 (map-get? validator-total-stake validator)) stake)
          )
          (ok true)
        )
      (ok true)
    )
  )
)

(define-public (withdraw-stake (flag-id uint))
  (let (
    (stake-entry (unwrap! (map-get? validator-stakes { flag-id: flag-id, validator: tx-sender }) (err ERR-INSUFFICIENT-STAKE)))
    (flag (unwrap! (map-get? flags flag-id) (err ERR-FLAG-NOT-FOUND)))
  )
    (asserts! (is-flag-expired flag-id) (err ERR-FLAG-NOT-EXPIRED))
    (asserts! (is-eq (get status flag) "confirmed") (err ERR-INVALID-STATUS))
    (let ((stake (get stake stake-entry)))
      (try! (as-contract (stx-transfer? stake tx-sender tx-sender)))
      (map-delete validator-stakes { flag-id: flag-id, validator: tx-sender })
      (map-set validator-total-stake tx-sender
        (- (default-to u0 (map-get? validator-total-stake tx-sender)) stake)
      )
      (ok stake)
    )
  )
)

(define-public (update-consensus-threshold (new-threshold uint))
  (begin
    (asserts! (and (>= new-threshold u51) (<= new-threshold u90)) (err ERR-INVALID-THRESHOLD))
    (asserts! (is-eq tx-sender (contract-call? .governance-hub get-admin)) (err ERR-NOT-AUTHORIZED))
    (var-set consensus-threshold new-threshold)
    (ok true)
  )
)

(define-public (update-voting-duration (new-duration uint))
  (begin
    (asserts! (and (>= new-duration u10) (<= new-duration u1000)) (err ERR-INVALID-CYCLE-DUR))
    (asserts! (is-eq tx-sender (contract-call? .governance-hub get-admin)) (err ERR-NOT-AUTHORIZED))
    (var-set voting-duration new-duration)
    (ok true)
  )
)

(define-public (update-min-stake (new-min uint))
  (begin
    (asserts! (>= new-min u100000) (err ERR-INVALID-STAKE))
    (asserts! (is-eq tx-sender (contract-call? .governance-hub get-admin)) (err ERR-NOT-AUTHORIZED))
    (var-set min-stake-amount new-min)
    (ok true)
  )
)

(define-read-only (get-next-flag-id)
  (ok (var-get next-flag-id))
)