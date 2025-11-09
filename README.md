# 🗳️ VoteReward: Tokenized Incentives for Informed Referendum Participation

Welcome to VoteReward, a Web3 project built on the Stacks blockchain using Clarity smart contracts! This platform addresses the real-world problem of low voter turnout and uninformed participation in referendums by incentivizing citizens with tokenized rewards. Users earn governance tokens for voting, with bonus rewards for demonstrating informed decision-making through on-chain quizzes. This fosters greater civic engagement, rewards knowledge, and ensures transparent, tamper-proof referendum processes in a decentralized manner.

## ✨ Features
🔑 Tokenized rewards for participation in referendums  
📚 Bonus incentives for passing knowledge-based quizzes on referendum topics  
🗳️ Secure, on-chain voting with staking mechanisms to prevent spam  
🏆 NFTs for top participants to recognize ongoing engagement  
💰 Automated reward distribution based on referendum outcomes and participation levels  
🔒 Immutable records of votes, quizzes, and rewards for transparency  
🚫 Anti-sybil measures to ensure fair, one-person-one-vote principles  
📊 Analytics dashboard integration for tracking community involvement  

## 🛠 How It Works
VoteReward leverages 8 Clarity smart contracts to create a robust ecosystem for incentivized voting. The system encourages informed participation by requiring users to stake tokens to vote and optionally complete quizzes for extra rewards. Rewards are distributed from a community treasury after referendums conclude.

**For Citizens (Voters)**
- Connect your Stacks wallet and stake governance tokens (via the Staking Contract) to gain voting power.
- Browse active referendums (created via the Referendum Contract).
- Optionally, take a quiz on the topic (handled by the Quiz Contract) to prove informed voting and earn bonus tokens.
- Cast your vote securely (using the Voting Contract).
- After the referendum ends, claim rewards (distributed by the Reward Contract) based on participation and quiz performance.

**For Referendum Creators (e.g., Governments or DAOs)**
- Propose a new referendum with details like question, options, duration, and quiz questions (via the Referendum Contract).
- Fund the reward pool from the Treasury Contract to incentivize participation.
- Use the Oracle Contract to input verified outcomes if needed (e.g., real-world referendum results for hybrid on-chain/off-chain setups).

**For Verifiers and Analysts**
- Query vote records and participation stats (via the Analytics Contract) for transparent audits.
- Verify user achievements and NFTs (minted by the NFT Contract) to confirm top contributors.

**Smart Contracts Overview**
This project involves 8 Clarity smart contracts for modularity and security:
1. **Governance Token Contract**: Manages the ERC-20-like reward token (VRT) for incentives.
2. **Referendum Contract**: Handles creation, management, and closure of referendums.
3. **Voting Contract**: Records votes with staking requirements to ensure commitment.
4. **Quiz Contract**: Stores quiz questions and verifies answers for informed voting bonuses.
5. **Reward Contract**: Calculates and distributes tokens based on participation and outcomes.
6. **Staking Contract**: Manages token staking for voting eligibility and anti-spam.
7. **Treasury Contract**: Holds and allocates funds for reward pools.
8. **NFT Contract**: Mints unique NFTs for high-engagement users as badges of honor.

Boom! With VoteReward, referendums become engaging, informed, and rewarding—driving real-world democratic participation through blockchain technology.