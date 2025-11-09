;; contracts/staking.clar
(define-constant ERR-UNAUTHORIZED u200)
(define-constant ERR-NOT-FOUND u201)
(define-constant ERR-INSUFFICIENT-BALANCE u202)
(define-constant ERR-ALREADY-STAKED u203)
(define-constant ERR-NOT-STAKED u204)
(define-constant ERR-STAKE-LOCKED u205)
(define-constant ERR-INVALID-AMOUNT u206)
(define-constant ERR-REFUND-TIMEOUT u207)
(define-constant ERR-MAX-REFUNDS u208)
(define-constant ERR-REFUND-PENDING u209)
(define-constant ERR-VOTING-IN-PROGRESS u210)

(define-constant MIN_STAKE u100)
(define-constant REFUND_TIMEOUT u1440)
(define-constant MAX_REFUNDS u5)

(define-data-var admin principal tx-sender)

(define-map UserStakes 
  { user: principal, referendum-id: uint }
  { 
    amount: uint, 
    locked: bool, 
    staked-at: uint, 
    last-refund: uint, 
    refund-count: uint 
  }
)

(define-map GlobalStaked uint uint)
(define-map PendingRefunds 
  { user: principal, referendum-id: uint }
  uint
)

(define-read-only (get-user-stake (user principal) (referendum-id uint))
  (map-get? UserStakes { user: user, referendum-id: referendum-id })
)

(define-read-only (get-global-staked (referendum-id uint))
  (default-to u0 (map-get? GlobalStaked referendum-id))
)

(define-read-only (is-stake-locked (user principal) (referendum-id uint))
  (match (map-get? UserStakes { user: user, referendum-id: referendum-id })
    stake (get locked stake)
    false
  )
)

(define-public (lock-stake (referendum-id uint) (amount uint))
  (let (
        (user-stake (get-user-stake tx-sender referendum-id))
        (global (get-global-staked referendum-id))
      )
    (asserts! (>= amount MIN_STAKE) (err ERR-INVALID-AMOUNT))
    (asserts! (is-none user-stake) (err ERR-ALREADY-STAKED))
    
    (try! (contract-call? .voting validate-stake-availability tx-sender referendum-id amount))
    
    (as-contract (contract-call? .treasury transfer-from tx-sender (as-contract tx-sender) amount))
    
    (map-set UserStakes 
      { user: tx-sender, referendum-id: referendum-id }
      {
        amount: amount,
        locked: true,
        staked-at: block-height,
        last-refund: u0,
        refund-count: u0
      }
    )
    
    (map-set GlobalStaked referendum-id (+ global amount))
    
    (print {
      event: "stake-locked",
      user: tx-sender,
      referendum-id: referendum-id,
      amount: amount
    })
    
    (ok true)
  )
)

(define-public (unlock-stake (referendum-id uint) (user principal) (amount uint))
  (let (
        (user-stake (unwrap! (map-get? UserStakes { user: user, referendum-id: referendum-id }) (err ERR-NOT-STAKED)))
        (global (get-global-staked referendum-id))
      )
    (asserts! (get locked user-stake) (err ERR-NOT-STAKED))
    (asserts! (is-eq tx-sender (contract-call? .voting get-admin)) (err ERR-UNAUTHORIZED))
    
    (map-set UserStakes 
      { user: user, referendum-id: referendum-id }
      (merge user-stake { locked: false })
    )
    
    (map-set GlobalStaked referendum-id (- global amount))
    
    (as-contract (contract-call? .treasury transfer user (as-contract tx-sender) amount))
    
    (print {
      event: "stake-unlocked",
      user: user,
      referendum-id: referendum-id,
      amount: amount
    })
    
    (ok true)
  )
)

(define-public (request-refund (referendum-id uint))
  (let (
        (user-stake (unwrap! (map-get? UserStakes { user: tx-sender, referendum-id: referendum-id }) (err ERR-NOT-STAKED)))
        (current-time block-height)
        (last-refund-time (get last-refund user-stake))
        (refund-count (get refund-count user-stake))
      )
    (asserts! (not (get locked user-stake)) (err ERR-STAKE-LOCKED))
    (asserts! (<= refund-count MAX_REFUNDS) (err ERR-MAX-REFUNDS))
    (asserts! (>= (- current-time last-refund-time) REFUND_TIMEOUT) (err ERR-REFUND-TIMEOUT))
    (asserts! (is-none (map-get? PendingRefunds { user: tx-sender, referendum-id: referendum-id })) (err ERR-REFUND-PENDING))
    
    (map-set PendingRefunds 
      { user: tx-sender, referendum-id: referendum-id }
      current-time
    )
    
    (map-set UserStakes 
      { user: tx-sender, referendum-id: referendum-id }
      (merge user-stake 
        { 
          last-refund: current-time,
          refund-count: (+ refund-count u1)
        }
      )
    )
    
    (print {
      event: "refund-requested",
      user: tx-sender,
      referendum-id: referendum-id,
      timeout: REFUND_TIMEOUT
    })
    
    (ok true)
  )
)

(define-public (claim-refund (referendum-id uint))
  (let (
        (pending (unwrap! (map-get? PendingRefunds { user: tx-sender, referendum-id: referendum-id }) (err ERR-NOT-FOUND)))
        (user-stake (unwrap! (map-get? UserStakes { user: tx-sender, referendum-id: referendum-id }) (err ERR-NOT-STAKED)))
        (amount (get amount user-stake))
        (global (get-global-staked referendum-id))
      )
    (asserts! (>= (- block-height pending) REFUND_TIMEOUT) (err ERR-REFUND-TIMEOUT))
    
    (map-delete PendingRefunds { user: tx-sender, referendum-id: referendum-id })
    (map-set GlobalStaked referendum-id (- global amount))
    (map-delete UserStakes { user: tx-sender, referendum-id: referendum-id })
    
    (as-contract (contract-call? .treasury transfer tx-sender (as-contract tx-sender) amount))
    
    (print {
      event: "refund-claimed",
      user: tx-sender,
      referendum-id: referendum-id,
      amount: amount
    })
    
    (ok amount)
  )
)

(define-public (admin-force-unlock (user principal) (referendum-id uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-UNAUTHORIZED))
    (match (map-get? UserStakes { user: user, referendum-id: referendum-id })
      stake 
        (begin
          (map-set UserStakes 
            { user: user, referendum-id: referendum-id }
            (merge stake { locked: false })
          )
          (ok true)
        )
      (err ERR-NOT-STAKED)
    )
  )
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-UNAUTHORIZED))
    (var-set admin new-admin)
    (ok true)
  )
)