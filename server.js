/**
 * Rock-Paper-Scissors Multiplayer Game Server
 *
 * This server handles:
 * - Player matchmaking queue
 * - Private game rooms
 * - Game logic (winner determination)
 * - Rematch system
 */

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Game configuration
const WINS_NEEDED = 2; // Best of 3

// Store game state
const waitingQueue = []; // Players waiting for a match
const activeRooms = new Map(); // roomId -> room state
const playerRooms = new Map(); // socketId -> roomId

/**
 * Get player nicknames - Vincent vs Daisy
 */
function getPlayerNicknames() {
  return {
    player1: "Vincent",
    player2: "Daisy",
  };
}

/**
 * Generate a unique room ID
 */
function generateRoomId() {
  return `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Determine the winner of a round
 * @returns 'player1' | 'player2' | 'draw'
 */
function determineWinner(choice1, choice2) {
  if (choice1 === choice2) return "draw";

  const wins = {
    rock: "scissors",
    paper: "rock",
    scissors: "paper",
  };

  return wins[choice1] === choice2 ? "player1" : "player2";
}

/**
 * Create a new game room with two players
 */
function createRoom(player1Socket, player2Socket) {
  const roomId = generateRoomId();
  const nicknames = getPlayerNicknames();

  const room = {
    id: roomId,
    players: {
      player1: {
        socketId: player1Socket.id,
        nickname: nicknames.player1,
        score: 0,
        choice: null,
        wantsRematch: false,
      },
      player2: {
        socketId: player2Socket.id,
        nickname: nicknames.player2,
        score: 0,
        choice: null,
        wantsRematch: false,
      },
    },
    round: 1,
    gameOver: false,
  };

  // Store room and player mappings
  activeRooms.set(roomId, room);
  playerRooms.set(player1Socket.id, roomId);
  playerRooms.set(player2Socket.id, roomId);

  // Join both players to the Socket.IO room
  player1Socket.join(roomId);
  player2Socket.join(roomId);

  return room;
}

/**
 * Reset room for a new match (rematch)
 */
function resetRoom(room) {
  room.players.player1.score = 0;
  room.players.player1.choice = null;
  room.players.player1.wantsRematch = false;
  room.players.player2.score = 0;
  room.players.player2.choice = null;
  room.players.player2.wantsRematch = false;
  room.round = 1;
  room.gameOver = false;
}

/**
 * Clean up a room and remove players
 */
function destroyRoom(roomId) {
  const room = activeRooms.get(roomId);
  if (room) {
    playerRooms.delete(room.players.player1.socketId);
    playerRooms.delete(room.players.player2.socketId);
    activeRooms.delete(roomId);
  }
}

/**
 * Get player role (player1 or player2) from socket ID
 */
function getPlayerRole(room, socketId) {
  if (room.players.player1.socketId === socketId) return "player1";
  if (room.players.player2.socketId === socketId) return "player2";
  return null;
}

/**
 * Check if both players have made their choices
 */
function bothPlayersChose(room) {
  return room.players.player1.choice && room.players.player2.choice;
}

/**
 * Process the round result
 */
function processRound(room) {
  const p1Choice = room.players.player1.choice;
  const p2Choice = room.players.player2.choice;
  const winner = determineWinner(p1Choice, p2Choice);

  // Update scores
  if (winner === "player1") {
    room.players.player1.score++;
  } else if (winner === "player2") {
    room.players.player2.score++;
  }

  // Check for match winner
  let matchWinner = null;
  if (room.players.player1.score >= WINS_NEEDED) {
    matchWinner = "player1";
    room.gameOver = true;
  } else if (room.players.player2.score >= WINS_NEEDED) {
    matchWinner = "player2";
    room.gameOver = true;
  }

  const result = {
    round: room.round,
    player1Choice: p1Choice,
    player2Choice: p2Choice,
    roundWinner: winner,
    scores: {
      player1: room.players.player1.score,
      player2: room.players.player2.score,
    },
    matchWinner: matchWinner,
  };

  // Reset choices for next round
  room.players.player1.choice = null;
  room.players.player2.choice = null;
  room.round++;

  return result;
}

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  /**
   * Handle player joining the matchmaking queue
   */
  socket.on("join_queue", () => {
    // Check if player is already in queue or in a game
    if (waitingQueue.includes(socket) || playerRooms.has(socket.id)) {
      return;
    }

    console.log(`Player ${socket.id} joined queue`);

    // Check if there's another player waiting
    if (waitingQueue.length > 0) {
      const opponent = waitingQueue.shift();

      // Create a new room for these two players
      const room = createRoom(opponent, socket);

      console.log(`Match created: ${room.id}`);

      // Notify both players that a match was found
      opponent.emit("match_found", {
        roomId: room.id,
        playerRole: "player1",
        playerNickname: room.players.player1.nickname,
        opponentNickname: room.players.player2.nickname,
      });

      socket.emit("match_found", {
        roomId: room.id,
        playerRole: "player2",
        playerNickname: room.players.player2.nickname,
        opponentNickname: room.players.player1.nickname,
      });

      // Start the first round after a short delay
      setTimeout(() => {
        io.to(room.id).emit("start_round", {
          round: room.round,
          scores: {
            player1: room.players.player1.score,
            player2: room.players.player2.score,
          },
        });
      }, 2000);
    } else {
      // Add player to waiting queue
      waitingQueue.push(socket);
    }
  });

  /**
   * Handle player choice (rock, paper, or scissors)
   */
  socket.on("player_choice", (data) => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;

    const room = activeRooms.get(roomId);
    if (!room || room.gameOver) return;

    const playerRole = getPlayerRole(room, socket.id);
    if (!playerRole) return;

    // Validate choice
    const validChoices = ["rock", "paper", "scissors"];
    if (!validChoices.includes(data.choice)) return;

    // Record the choice
    room.players[playerRole].choice = data.choice;

    console.log(`${playerRole} chose ${data.choice} in room ${roomId}`);

    // Notify opponent that this player has locked in (without revealing choice)
    const opponentRole = playerRole === "player1" ? "player2" : "player1";
    const opponentSocketId = room.players[opponentRole].socketId;
    io.to(opponentSocketId).emit("opponent_locked");

    // Check if both players have made their choices
    if (bothPlayersChose(room)) {
      const result = processRound(room);

      // Send round result to both players
      io.to(room.id).emit("round_result", result);

      // If match is over, send match result
      if (result.matchWinner) {
        setTimeout(() => {
          io.to(room.id).emit("match_result", {
            winner: result.matchWinner,
            finalScores: result.scores,
            player1Nickname: room.players.player1.nickname,
            player2Nickname: room.players.player2.nickname,
          });
        }, 2000);
      } else {
        // Start next round after delay
        setTimeout(() => {
          io.to(room.id).emit("start_round", {
            round: room.round,
            scores: result.scores,
          });
        }, 3000);
      }
    }
  });

  /**
   * Handle rematch request
   */
  socket.on("request_rematch", () => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;

    const room = activeRooms.get(roomId);
    if (!room || !room.gameOver) return;

    const playerRole = getPlayerRole(room, socket.id);
    if (!playerRole) return;

    // Mark this player as wanting a rematch
    room.players[playerRole].wantsRematch = true;

    console.log(`${playerRole} wants rematch in room ${roomId}`);

    // Notify opponent
    const opponentRole = playerRole === "player1" ? "player2" : "player1";
    const opponentSocketId = room.players[opponentRole].socketId;
    io.to(opponentSocketId).emit("opponent_wants_rematch");

    // Check if both want rematch
    if (
      room.players.player1.wantsRematch &&
      room.players.player2.wantsRematch
    ) {
      resetRoom(room);

      // Notify both players
      io.to(room.id).emit("rematch_accepted");

      // Start first round
      setTimeout(() => {
        io.to(room.id).emit("start_round", {
          round: room.round,
          scores: {
            player1: 0,
            player2: 0,
          },
        });
      }, 1500);
    }
  });

  /**
   * Handle player leaving to find new match
   */
  socket.on("leave_room", () => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;

    const room = activeRooms.get(roomId);
    if (!room) return;

    const playerRole = getPlayerRole(room, socket.id);
    const opponentRole = playerRole === "player1" ? "player2" : "player1";
    const opponentSocketId = room.players[opponentRole].socketId;

    // Notify opponent
    io.to(opponentSocketId).emit("opponent_disconnected");

    // Clean up
    socket.leave(roomId);
    playerRooms.delete(socket.id);

    // Remove opponent from room mapping too
    playerRooms.delete(opponentSocketId);
    io.sockets.sockets.get(opponentSocketId)?.leave(roomId);

    activeRooms.delete(roomId);
  });

  /**
   * Handle disconnection
   */
  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);

    // Remove from queue if waiting
    const queueIndex = waitingQueue.findIndex((s) => s.id === socket.id);
    if (queueIndex !== -1) {
      waitingQueue.splice(queueIndex, 1);
    }

    // Handle active game disconnection
    const roomId = playerRooms.get(socket.id);
    if (roomId) {
      const room = activeRooms.get(roomId);
      if (room) {
        const playerRole = getPlayerRole(room, socket.id);
        const opponentRole = playerRole === "player1" ? "player2" : "player1";
        const opponentSocketId = room.players[opponentRole].socketId;

        // Notify opponent
        io.to(opponentSocketId).emit("opponent_disconnected");

        // Clean up
        playerRooms.delete(opponentSocketId);
        destroyRoom(roomId);
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Rock-Paper-Scissors server running on port ${PORT}`);
  console.log(`   Open http://localhost:${PORT} in your browser`);

  // Cron job: Keep the server awake on Render free tier
  // Pings itself every 14 minutes to prevent sleeping
  if (process.env.RENDER) {
    const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
    if (RENDER_URL) {
      setInterval(() => {
        fetch(RENDER_URL)
          .then(() => console.log(`⏰ Keep-alive ping sent to ${RENDER_URL}`))
          .catch((err) => console.log("Keep-alive ping failed:", err.message));
      }, 14 * 60 * 1000); // Every 14 minutes
      console.log(`   ⏰ Keep-alive cron job enabled for ${RENDER_URL}`);
    }
  }
});
