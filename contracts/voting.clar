;; contracts/voting.clar
(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-NOT-FOUND u101)
(define-constant ERR-INVALID-STATE u102)
(define-constant ERR-ALREADY-VOTED u103)
(define-constant ERR-INSUFFICIENT-STAKE u104)
(define-constant ERR-NOT-ACTIVE u105)
(define-constant ERR-ENDED u106)
(define-constant ERR-QUIZ-REQUIRED u107)
(define-constant ERR-QUIZ-FAILED u108)
(define-constant ERR-STAKE-LOCKED u109)
(define-constant ERR-ZERO-STAKE u110)

(define-constant MIN-STAKE u100)
(define-constant VOTE-MULTIPLIER u100)

(define-data-var referendum-contract principal (as-contract tx-sender))

(define-map Votes 
  { referendum-id: uint, voter: principal }
  { choice: bool, stake: uint, multiplier: uint, voted-at: uint }
)

(define-map UserStakes 
  { referendum-id: uint, voter: principal }
  uint
)

(define-map TotalYesVotes uint uint)
(define-map TotalNoVotes uint uint)
(define-map TotalStaked uint uint)

(define-read-only (get-vote (referendum-id uint) (voter principal))
  (map-get? Votes { referendum-id: referendum-id, voter: voter })
)

(define-read-only (has-voted (referendum-id uint) (voter principal))
  (is-some (get-vote referendum-id voter))
)

(define-read-only (get-total-yes (referendum-id uint))
  (default-to u0 (map-get? TotalYesVotes referendum-id))
)

(define-read-only (get-total-no (referendum-id uint))
  (default-to u0 (map-get? TotalNoVotes referendum-id))
)

(define-read-only (get-total-staked (referendum-id uint))
  (default-to u0 (map-get? TotalStaked referendum-id))
)

(define-public (cast-vote 
    (referendum-id uint) 
    (choice bool) 
    (stake-amount uint)
    (quiz-passed bool)
  )
  (let (
        (referendum (contract-call? .referendum get-referendum referendum-id))
        (current-stake (default-to u0 (map-get? UserStakes { referendum-id: referendum-id, voter: tx-sender })))
        (already-voted (has-voted referendum-id tx-sender))
      )
    (asserts! (is-some referendum) (err ERR-NOT-FOUND))
    (let ((ref (unwrap! referendum (err ERR-NOT-FOUND))))
      (asserts! (is-eq (get status ref) "active") (err ERR-NOT-ACTIVE))
      (asserts! (>= block-height (get start-block ref)) (err ERR-INVALID-STATE))
      (asserts! (< block-height (get end-block ref)) (err ERR-ENDED))
      (asserts! (not already-voted) (err ERR-ALREADY-VOTED))
      (asserts! (>= stake-amount MIN-STAKE) (err ERR-INSUFFICIENT-STAKE))
      (asserts! (> stake-amount u0) (err ERR-ZERO-STAKE))

      (if (get quiz-required ref)
          (begin
            (asserts! (is-some (get quiz-id ref)) (err ERR-QUIZ-REQUIRED))
            (asserts! quiz-passed (err ERR-QUIZ-FAILED))
          )
          true
      )

      (let ((multiplier (if (and (get quiz-required ref) quiz-passed) u150 VOTE-MULTIPLIER)))
        (try! (contract-call? .staking lock-stake referendum-id stake-amount))

        (map-set Votes
          { referendum-id: referendum-id, voter: tx-sender }
          { choice: choice, stake: stake-amount, multiplier: multiplier, voted-at: block-height }
        )

        (map-set UserStakes
          { referendum-id: referendum-id, voter: tx-sender }
          stake-amount
        )

        (if choice
          (map-set TotalYesVotes referendum-id 
            (+ (get-total-yes referendum-id) (* stake-amount multiplier)))
          (map-set TotalNoVotes referendum-id 
            (+ (get-total-no referendum-id) (* stake-amount multiplier)))
        )

        (map-set TotalStaked referendum-id 
          (+ (get-total-staked referendum-id) stake-amount)
        )

        (print {
          event: "vote-cast",
          referendum-id: referendum-id,
          voter: tx-sender,
          choice: choice,
          stake: stake-amount,
          multiplier: multiplier,
          quiz-bonus: (and (get quiz-required ref) quiz-passed)
        })

        (ok true)
      )
    )
  )
)

(define-public (update-vote (referendum-id uint) (new-choice bool))
  (let (
        (vote (unwrap! (get-vote referendum-id tx-sender) (err ERR-NOT-FOUND)))
        (referendum (contract-call? .referendum get-referendum referendum-id))
      )
    (asserts! (is-some referendum) (err ERR-NOT-FOUND))
    (let ((ref (unwrap! referendum (err ERR-NOT-FOUND))))
      (asserts! (is-eq (get status ref) "active") (err ERR-NOT-ACTIVE))
      (asserts! (< block-height (get end-block ref)) (err ERR-ENDED))

      (let ((old-weighted (* (get stake vote) (get multiplier vote)))
            (new-weighted (* (get stake vote) (get multiplier vote))))
        (if (get choice vote)
          (map-set TotalYesVotes referendum-id (- (get-total-yes referendum-id) old-weighted))
          (map-set TotalNoVotes referendum-id (- (get-total-no referendum-id) old-weighted))
        )

        (if new-choice
          (map-set TotalYesVotes referendum-id (+ (get-total-yes referendum-id) new-weighted))
          (map-set TotalNoVotes referendum-id (+ (get-total-no referendum-id) new-weighted))
        )

        (map-set Votes
          { referendum-id: referendum-id, voter: tx-sender }
          (merge vote { choice: new-choice })
        )

        (ok true)
      )
    )
  )
)

(define-public (withdraw-stake (referendum-id uint))
  (let (
        (vote (get-vote referendum-id tx-sender))
        (referendum (contract-call? .referendum get-referendum referendum-id))
      )
    (asserts! (is-some referendum) (err ERR-NOT-FOUND))
    (let ((ref (unwrap! referendum (err ERR-NOT-FOUND))))
      (asserts! (is-eq (get status ref) "closed") (err ERR-STAKE-LOCKED))
      (asserts! (is-some vote) (err ERR-NOT-FOUND))

      (let ((stake (get stake (unwrap! vote (err ERR-NOT-FOUND)))))
        (try! (contract-call? .staking unlock-stake referendum-id tx-sender stake))

        (map-delete Votes { referendum-id: referendum-id, voter: tx-sender })
        (map-delete UserStakes { referendum-id: referendum-id, voter: tx-sender })

        (print { event: "stake-withdrawn", referendum-id: referendum-id, voter: tx-sender, amount: stake })

        (ok stake)
      )
    )
  )
)