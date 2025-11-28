/**
 * Rock Paper Scissors - Multiplayer Game Client
 *
 * Handles:
 * - Socket.IO connection to server
 * - UI state management
 * - User interactions
 * - Game flow
 */

// Initialize Socket.IO connection
const socket = io();

// ==================== DOM ELEMENTS ====================
const screens = {
  queue: document.getElementById("queue-screen"),
  matchFound: document.getElementById("match-found-screen"),
  game: document.getElementById("game-screen"),
  result: document.getElementById("result-screen"),
};

// Queue screen elements
const joinQueueBtn = document.getElementById("join-queue-btn");
const queueStatus = document.getElementById("queue-status");
const queueTimeDisplay = document.querySelector(".queue-time");

// Match found screen elements
const yourNicknameDisplay = document.getElementById("your-nickname");
const opponentNicknameDisplay = document.getElementById("opponent-nickname");

// Game screen elements
const gameYourName = document.getElementById("game-your-name");
const gameOpponentName = document.getElementById("game-opponent-name");
const yourScoreDisplay = document.getElementById("your-score");
const opponentScoreDisplay = document.getElementById("opponent-score");
const roundNumberDisplay = document.getElementById("round-number");
const statusMessage = document.getElementById("status-message");
const yourChoiceDisplay = document.getElementById("your-choice-display");
const opponentChoiceDisplay = document.getElementById(
  "opponent-choice-display"
);
const choiceButtons = document.getElementById("choice-buttons");
const waitingIndicator = document.getElementById("waiting-indicator");

// Result screen elements
const resultIcon = document.getElementById("result-icon");
const resultTitle = document.getElementById("result-title");
const resultSubtitle = document.getElementById("result-subtitle");
const finalYourName = document.getElementById("final-your-name");
const finalOpponentName = document.getElementById("final-opponent-name");
const finalYourScore = document.getElementById("final-your-score");
const finalOpponentScore = document.getElementById("final-opponent-score");
const rematchBtn = document.getElementById("rematch-btn");
const newMatchBtn = document.getElementById("new-match-btn");
const rematchStatus = document.getElementById("rematch-status");

// Modal elements
const disconnectModal = document.getElementById("disconnect-modal");
const backToQueueBtn = document.getElementById("back-to-queue-btn");

// ==================== GAME STATE ====================
let gameState = {
  playerRole: null, // 'player1' or 'player2'
  playerNickname: "",
  opponentNickname: "",
  roomId: null,
  myChoice: null,
  queueTimer: null,
  queueSeconds: 0,
};

// Choice icons mapping
const choiceIcons = {
  rock: "🪨",
  paper: "📄",
  scissors: "✂️",
};

// ==================== SCREEN MANAGEMENT ====================

/**
 * Switch to a different screen
 */
function showScreen(screenName) {
  Object.values(screens).forEach((screen) => {
    screen.classList.remove("active");
  });
  screens[screenName].classList.add("active");
}

/**
 * Reset game UI to initial state
 */
function resetGameUI() {
  yourChoiceDisplay.textContent = "❓";
  opponentChoiceDisplay.textContent = "❓";
  yourChoiceDisplay.classList.remove("reveal");
  opponentChoiceDisplay.classList.remove("reveal");
  statusMessage.textContent = "Make your choice!";
  statusMessage.className = "";
  choiceButtons.classList.remove("hidden");
  waitingIndicator.classList.add("hidden");
  gameState.myChoice = null;

  // Reset button states
  document.querySelectorAll(".choice-btn").forEach((btn) => {
    btn.classList.remove("selected");
    btn.disabled = false;
  });
}

// ==================== QUEUE MANAGEMENT ====================

/**
 * Start the queue timer
 */
function startQueueTimer() {
  gameState.queueSeconds = 0;
  updateQueueTime();
  gameState.queueTimer = setInterval(() => {
    gameState.queueSeconds++;
    updateQueueTime();
  }, 1000);
}

/**
 * Stop the queue timer
 */
function stopQueueTimer() {
  if (gameState.queueTimer) {
    clearInterval(gameState.queueTimer);
    gameState.queueTimer = null;
  }
}

/**
 * Update queue time display
 */
function updateQueueTime() {
  const minutes = Math.floor(gameState.queueSeconds / 60);
  const seconds = gameState.queueSeconds % 60;
  queueTimeDisplay.textContent = `${minutes}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

// ==================== EVENT LISTENERS ====================

// Join queue button
joinQueueBtn.addEventListener("click", () => {
  socket.emit("join_queue");
  joinQueueBtn.classList.add("hidden");
  queueStatus.classList.remove("hidden");
  startQueueTimer();
});

// Choice buttons
document.querySelectorAll(".choice-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (gameState.myChoice) return; // Already chose

    const choice = btn.dataset.choice;
    gameState.myChoice = choice;

    // Update UI
    btn.classList.add("selected");
    document
      .querySelectorAll(".choice-btn")
      .forEach((b) => (b.disabled = true));
    yourChoiceDisplay.textContent = choiceIcons[choice];

    // Show waiting indicator
    choiceButtons.classList.add("hidden");
    waitingIndicator.classList.remove("hidden");
    statusMessage.textContent = "Choice locked in!";

    // Send choice to server
    socket.emit("player_choice", { choice });
  });
});

// Rematch button
rematchBtn.addEventListener("click", () => {
  socket.emit("request_rematch");
  rematchBtn.disabled = true;
  rematchStatus.classList.remove("hidden");
});

// New match button
newMatchBtn.addEventListener("click", () => {
  socket.emit("leave_room");
  resetToQueue();
});

// Back to queue button (from disconnect modal)
backToQueueBtn.addEventListener("click", () => {
  disconnectModal.classList.add("hidden");
  resetToQueue();
});

/**
 * Reset to queue screen
 */
function resetToQueue() {
  gameState = {
    playerRole: null,
    playerNickname: "",
    opponentNickname: "",
    roomId: null,
    myChoice: null,
    queueTimer: null,
    queueSeconds: 0,
  };

  joinQueueBtn.classList.remove("hidden");
  queueStatus.classList.add("hidden");
  rematchBtn.disabled = false;
  rematchStatus.classList.add("hidden");

  showScreen("queue");
}

// ==================== SOCKET EVENT HANDLERS ====================

/**
 * Handle match found event
 */
socket.on("match_found", (data) => {
  stopQueueTimer();

  // Store game state
  gameState.roomId = data.roomId;
  gameState.playerRole = data.playerRole;
  gameState.playerNickname = data.playerNickname;
  gameState.opponentNickname = data.opponentNickname;

  // Update match found screen
  yourNicknameDisplay.textContent = data.playerNickname;
  opponentNicknameDisplay.textContent = data.opponentNickname;

  // Update game screen names
  gameYourName.textContent = data.playerNickname;
  gameOpponentName.textContent = data.opponentNickname;

  // Show match found screen
  showScreen("matchFound");
});

/**
 * Handle start round event
 */
socket.on("start_round", (data) => {
  // Update scores
  if (gameState.playerRole === "player1") {
    yourScoreDisplay.textContent = data.scores.player1;
    opponentScoreDisplay.textContent = data.scores.player2;
  } else {
    yourScoreDisplay.textContent = data.scores.player2;
    opponentScoreDisplay.textContent = data.scores.player1;
  }

  // Update round number
  roundNumberDisplay.textContent = data.round;

  // Reset UI and show game screen
  resetGameUI();
  showScreen("game");
});

/**
 * Handle opponent locked in event
 */
socket.on("opponent_locked", () => {
  // Visual feedback that opponent has chosen
  opponentChoiceDisplay.textContent = "✅";
});

/**
 * Handle round result event
 */
socket.on("round_result", (data) => {
  // Determine choices to display based on player role
  const myChoice =
    gameState.playerRole === "player1"
      ? data.player1Choice
      : data.player2Choice;
  const theirChoice =
    gameState.playerRole === "player1"
      ? data.player2Choice
      : data.player1Choice;

  // Reveal choices with animation
  yourChoiceDisplay.textContent = choiceIcons[myChoice];
  yourChoiceDisplay.classList.add("reveal");

  setTimeout(() => {
    opponentChoiceDisplay.textContent = choiceIcons[theirChoice];
    opponentChoiceDisplay.classList.add("reveal");
  }, 300);

  // Determine result message
  let resultText = "";
  let resultClass = "";

  if (data.roundWinner === "draw") {
    resultText = "It's a Draw!";
    resultClass = "status-draw";
  } else {
    const iWon =
      (gameState.playerRole === "player1" && data.roundWinner === "player1") ||
      (gameState.playerRole === "player2" && data.roundWinner === "player2");

    if (iWon) {
      resultText = "You Win This Round! 🎉";
      resultClass = "status-win";
    } else {
      resultText = "You Lose This Round 😔";
      resultClass = "status-lose";
    }
  }

  // Update status
  setTimeout(() => {
    statusMessage.textContent = resultText;
    statusMessage.className = resultClass;
    waitingIndicator.classList.add("hidden");
  }, 600);

  // Update scores
  if (gameState.playerRole === "player1") {
    yourScoreDisplay.textContent = data.scores.player1;
    opponentScoreDisplay.textContent = data.scores.player2;
  } else {
    yourScoreDisplay.textContent = data.scores.player2;
    opponentScoreDisplay.textContent = data.scores.player1;
  }
});

/**
 * Handle match result event
 */
socket.on("match_result", (data) => {
  // Determine if we won
  const iWon =
    (gameState.playerRole === "player1" && data.winner === "player1") ||
    (gameState.playerRole === "player2" && data.winner === "player2");

  // Update result screen
  if (iWon) {
    resultIcon.textContent = "🏆";
    resultTitle.textContent = "Victory!";
    resultTitle.className = "result-title win";
    resultSubtitle.textContent = "Congratulations, you won the match!";
  } else {
    resultIcon.textContent = "😢";
    resultTitle.textContent = "Defeat";
    resultTitle.className = "result-title lose";
    resultSubtitle.textContent = "Better luck next time!";
  }

  // Update final scores
  finalYourName.textContent = gameState.playerNickname;
  finalOpponentName.textContent = gameState.opponentNickname;

  if (gameState.playerRole === "player1") {
    finalYourScore.textContent = data.finalScores.player1;
    finalOpponentScore.textContent = data.finalScores.player2;
  } else {
    finalYourScore.textContent = data.finalScores.player2;
    finalOpponentScore.textContent = data.finalScores.player1;
  }

  // Reset rematch state
  rematchBtn.disabled = false;
  rematchStatus.classList.add("hidden");

  // Show result screen
  showScreen("result");
});

/**
 * Handle opponent wants rematch event
 */
socket.on("opponent_wants_rematch", () => {
  rematchBtn.textContent = "🔄 Accept Rematch";
});

/**
 * Handle rematch accepted event
 */
socket.on("rematch_accepted", () => {
  rematchBtn.textContent = "🔄 Play Again";
  rematchBtn.disabled = false;
  rematchStatus.classList.add("hidden");

  // Reset scores display
  yourScoreDisplay.textContent = "0";
  opponentScoreDisplay.textContent = "0";
});

/**
 * Handle opponent disconnected event
 */
socket.on("opponent_disconnected", () => {
  stopQueueTimer();
  disconnectModal.classList.remove("hidden");
});

/**
 * Handle reconnection
 */
socket.on("connect", () => {
  console.log("Connected to server");
});

socket.on("disconnect", () => {
  console.log("Disconnected from server");
});

// ==================== INITIALIZATION ====================
console.log("🎮 Rock Paper Scissors client initialized");
