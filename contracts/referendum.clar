;; contracts/referendum.clar
(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-NOT-FOUND u101)
(define-constant ERR-ALREADY-EXISTS u102)
(define-constant ERR-INVALID-STATE u103)
(define-constant ERR-QUORUM-TOO-HIGH u104)
(define-constant ERR-REWARD-POOL-ZERO u105)
(define-constant ERR-BLOCKS-IN-PAST u106)
(define-constant ERR-INVALID-QUIZ-ID u107)
(define-constant ERR-QUIZ-REQUIRED u108)
(define-constant ERR-ENDED u109)
(define-constant ERR-NOT-ENDED u110)
(define-constant ERR-ALREADY-CLOSED u111)

(define-data-var next-referendum-id uint u0)

(define-map Referendums uint
  {
    title: (string-ascii 120),
    description: (string-ascii 1000),
    creator: principal,
    start-block: uint,
    end-block: uint,
    quorum: uint,
    reward-pool: uint,
    quiz-required: bool,
    quiz-id: (optional uint),
    status: (string-ascii 20),
    yes-votes: uint,
    no-votes: uint,
    total-staked: uint,
    final-result: (optional bool)
  }
)

(define-map referendum-title-index (string-ascii 120) uint)

(define-read-only (get-referendum (id uint))
  (map-get? Referendums id)
)

(define-read-only (get-referendum-by-title (title (string-ascii 120)))
  (map-get? referendum-title-index title)
)

(define-read-only (is-active (id uint))
  (match (map-get? Referendums id)
    ref (and 
          (is-eq (get status ref) "active")
          (>= block-height (get start-block ref))
          (< block-height (get end-block ref))
        )
    false)
)

(define-read-only (has-ended (id uint))
  (match (map-get? Referendums id)
    ref (>= block-height (get end-block ref))
    false)
)

(define-public (create-referendum
    (title (string-ascii 120))
    (description (string-ascii 1000))
    (start-block uint)
    (end-block uint)
    (quorum uint)
    (reward-pool uint)
    (quiz-required bool)
    (quiz-id (optional uint))
  )
  (let (
        (id (var-get next-referendum-id))
        (existing-id (map-get? referendum-title-index title))
      )
    (asserts! (is-none existing-id) (err ERR-ALREADY-EXISTS))
    (asserts! (> (len title) u0) (err ERR-INVALID-STATE))
    (asserts! (>= end-block (+ start-block u10)) (err ERR-INVALID-STATE))
    (asserts! (>= start-block block-height) (err ERR-BLOCKS-IN-PAST))
    (asserts! (<= quorum u10000) (err ERR-QUORUM-TOO-HIGH))
    (asserts! (> reward-pool u0) (err ERR-REWARD-POOL-ZERO))
    (if quiz-required
        (asserts! (is-some quiz-id) (err ERR-INVALID-QUIZ-ID))
        true
    )
    (map-set Referendums id
      {
        title: title,
        description: description,
        creator: tx-sender,
        start-block: start-block,
        end-block: end-block,
        quorum: quorum,
        reward-pool: reward-pool,
        quiz-required: quiz-required,
        quiz-id: quiz-id,
        status: "pending",
        yes-votes: u0,
        no-votes: u0,
        total-staked: u0,
        final-result: none
      }
    )
    (map-set referendum-title-index title id)
    (var-set next-referendum-id (+ id u1))
    (print {event: "referendum-created", id: id, title: title})
    (ok id)
  )
)

(define-public (activate-referendum (id uint))
  (let ((ref (unwrap! (map-get? Referendums id) (err ERR-NOT-FOUND))))
    (asserts! (is-eq (get creator ref) tx-sender) (err ERR-UNAUTHORIZED))
    (asserts! (is-eq (get status ref) "pending") (err ERR-INVALID-STATE))
    (asserts! (<= block-height (get start-block ref)) (err ERR-BLOCKS-IN-PAST))
    (map-set Referendums id (merge ref {status: "active"}))
    (ok true)
  )
)

(define-public (close-referendum (id uint))
  (let (
        (ref (unwrap! (map-get? Referendums id) (err ERR-NOT-FOUND)))
        (yes (get yes-votes ref))
        (no (get no-votes ref))
        (total (+ yes no))
        (quorum-met (>= total (get quorum)))
        (winner (if (> yes no) (some true) (if (> no yes) (some false) none)))
      )
    (asserts! (or (is-eq tx-sender (get creator ref)) (is-eq tx-sender (contract-call? .authority get-admin))) (err ERR-UNAUTHORIZED))
    (asserts! (is-eq (get status ref) "active") (err ERR-INVALID-STATE))
    (asserts! (has-ended id) (err ERR-NOT-ENDED))
    (asserts! (is-none (get final-result ref)) (err ERR-ALREADY-CLOSED))
    (map-set Referendums id
      (merge ref
        {
          status: "closed",
          final-result: (if quorum-met winner none)
        }
      )
    )
    (print {event: "referendum-closed", id: id, result: winner, quorum-met: quorum-met})
    (ok true)
  )
)

(define-public (cancel-referendum (id uint))
  (let ((ref (unwrap! (map-get? Referendums id) (err ERR-NOT-FOUND))))
    (asserts! (is-eq (get creator ref) tx-sender) (err ERR-UNAUTHORIZED))
    (asserts! (not (is-eq (get status ref) "closed")) (err ERR-INVALID-STATE))
    (map-set Referendums id (merge ref {status: "cancelled"}))
    (ok true)
  )
)

(define-public (update-reward-pool (id uint) (new-pool uint))
  (let ((ref (unwrap! (map-get? Referendums id) (err ERR-NOT-FOUND))))
    (asserts! (is-eq (get creator ref) tx-sender) (err ERR-UNAUTHORIZED))
    (asserts! (is-eq (get status ref) "pending") (err ERR-INVALID-STATE))
    (asserts! (> new-pool u0) (err ERR-REWARD-POOL-ZERO))
    (map-set Referendums id (merge ref {reward-pool: new-pool}))
    (ok true)
  )
)