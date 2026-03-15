import { supabase, signUp, logIn, logOut, getCurrentUser, getSession, upsertLeaderboardRecord, fetchLeaderboard } from './Auth.js';

class ChessGame {
    constructor() {
        this.board = [];
        this.currentPlayer = 'white';
        this.selectedSquare = null;
        this.validMoves = [];
        this.lastMove = null;
        this.enPassantTarget = null;
        this.castlingRights = {
            white: { kingSide: true, queenSide: true },
            black: { kingSide: true, queenSide: true }
        };
        this.capturedPieces = { white: [], black: [] };
        this.isGameOver = false;
        this.moveHistory = [];
        this.notationHistory = [];
        this.halfMoveClock = 0;
        this.fullMoveNumber = 1;

        // Use image-based pieces (Wikimedia Commons - reliable)
        this.pieceImages = {
            white: {
                king: 'https://lichess1.org/assets/piece/pixel/wK.svg',
                queen: 'https://lichess1.org/assets/piece/pixel/wQ.svg',
                rook: 'https://lichess1.org/assets/piece/pixel/wR.svg',
                bishop: 'https://lichess1.org/assets/piece/pixel/wB.svg',
                knight: 'https://lichess1.org/assets/piece/pixel/wN.svg',
                pawn: 'https://lichess1.org/assets/piece/pixel/wP.svg'
            },
            black: {
                king: 'https://lichess1.org/assets/piece/pixel/bK.svg',
                queen: 'https://lichess1.org/assets/piece/pixel/bQ.svg',
                rook: 'https://lichess1.org/assets/piece/pixel/bR.svg',
                bishop: 'https://lichess1.org/assets/piece/pixel/bB.svg',
                knight: 'https://lichess1.org/assets/piece/pixel/bN.svg',
                pawn: 'https://lichess1.org/assets/piece/pixel/bP.svg'
            }
        };
        // Fallback unicode pieces
        this.pieces = {
            white: { king: '\u2654', queen: '\u2655', rook: '\u2656', bishop: '\u2657', knight: '\u2658', pawn: '\u2659' },
            black: { king: '\u265A', queen: '\u265B', rook: '\u265C', bishop: '\u265D', knight: '\u265E', pawn: '\u265F' }
        };
        this.useImagePieces = true;

        // Opponents with ELO ratings mapped to Stockfish settings
        // skill: Stockfish Skill Level (0-20), depth: search depth, randomMoveChance: probability of playing a random legal move
        // Skill Level 0 + depth 1 plays ~800 ELO, so we use randomMoveChance to weaken bots below that
        this.opponents = {
            baby: { name: 'Baby Ben', avatar: '👶', title: 'First Timer', elo: 100, skill: 0, depth: 1, randomMoveChance: 0.85 },
            timmy: { name: 'Timmy', avatar: '🧒', title: 'Beginner', elo: 200, skill: 0, depth: 1, randomMoveChance: 0.70 },
            grandma: { name: 'Grandma Rose', avatar: '👵', title: 'Casual', elo: 300, skill: 0, depth: 1, randomMoveChance: 0.55 },
            sarah: { name: 'Sarah', avatar: '👧', title: 'Casual Player', elo: 400, skill: 0, depth: 1, randomMoveChance: 0.40 },
            mike: { name: 'Mike', avatar: '👦', title: 'Novice', elo: 500, skill: 0, depth: 1, randomMoveChance: 0.25 },
            bob: { name: 'Bob', avatar: '👨', title: 'Hobbyist', elo: 600, skill: 0, depth: 1, randomMoveChance: 0.15 },
            lisa: { name: 'Lisa', avatar: '👩‍💼', title: 'Patzer', elo: 750, skill: 0, depth: 2, randomMoveChance: 0.05 },
            elena: { name: 'Elena', avatar: '👩', title: 'Club Player', elo: 900, skill: 1, depth: 3, randomMoveChance: 0 },
            raj: { name: 'Raj', avatar: '👨‍💻', title: 'Rising Star', elo: 1050, skill: 3, depth: 4, randomMoveChance: 0 },
            marcus: { name: 'Marcus', avatar: '🧔', title: 'Intermediate', elo: 1200, skill: 5, depth: 6, randomMoveChance: 0 },
            anna: { name: 'Anna', avatar: '👩‍🎓', title: 'Skilled', elo: 1300, skill: 7, depth: 8, randomMoveChance: 0 },
            victoria: { name: 'Victoria', avatar: '👩‍🦰', title: 'Advanced', elo: 1400, skill: 9, depth: 10, randomMoveChance: 0 },
            igor: { name: 'Igor', avatar: '🧓', title: 'Veteran', elo: 1500, skill: 11, depth: 11, randomMoveChance: 0 },
            chen: { name: 'Dr. Chen', avatar: '👨‍🏫', title: 'Expert', elo: 1600, skill: 13, depth: 12, randomMoveChance: 0 },
            natasha: { name: 'Natasha', avatar: '👸', title: 'Master', elo: 1700, skill: 15, depth: 13, randomMoveChance: 0 },
            magnus: { name: 'Grandmaster X', avatar: '🏆', title: 'Grandmaster', elo: 1800, skill: 17, depth: 15, randomMoveChance: 0 },
            stockfish: { name: 'Stockfish Jr', avatar: '🐟', title: 'Super GM', elo: 2000, skill: 20, depth: 18, randomMoveChance: 0 },
            deepblue: { name: 'Deep Blue', avatar: '🤖', title: 'Maximum', elo: 2200, skill: 20, depth: 22, randomMoveChance: 0 }
        };

        // Game mode settings
        this.gameMode = 'computer';
        this.playerColor = 'white';
        this.selectedOpponent = 'elena'; // Default opponent
        this.isThinking = false;
        this.isAnimating = false;

        // Online multiplayer properties
        this.lobbyCode = null;
        this.channel = null;
        this.isHost = false;
        this.isRemoteMove = false;
        this.opponentJoined = false;
        this.opponentName = null;

        // Chess clock settings
        this.clockEnabled = true;
        this.timeControl = 'rapid'; // bullet, blitz, rapid, classical
        this.timeControls = {
            bullet: { initial: 1 * 60, increment: 0 },
            blitz: { initial: 3 * 60, increment: 2 },
            rapid: { initial: 10 * 60, increment: 5 },
            classical: { initial: 30 * 60, increment: 10 }
        };
        this.initialTime = this.timeControls[this.timeControl].initial;
        this.increment = this.timeControls[this.timeControl].increment;
        this.playerTime = this.initialTime;
        this.opponentTime = this.initialTime;
        this.clockInterval = null;
        this.lastClockUpdate = null;

        // Position tracking for draw detection
        this.positionHistory = [];
        this.positionCounts = new Map();
        this.drawOffered = false;

        // Game timing for leaderboard
        this.gameStartTime = null;
        this.accountSystem = null; // Will be set after initialization

        // Stockfish engine
        this.engine = null;
        this.engineReady = false;

        // Sound effects using Web Audio API
        this.audioContext = null;
        this.soundEnabled = true;
        this.initAudio();

        // Chat messages by opponent personality
        this.tieredMessages = {
            baby: {
                greetings: [
                    "Ooh, what are these horsies? Let's play!",
                    "Hi hi hi! I love chess! ...What's chess?",
                    "I'm gonna move all the little guys! Ready?",
                    "Mommy said I should try this game!",
                    "The pieces are so pretty! Which one's mine?",
                    "I wanna be the castle! Can I be the castle?",
                    "Let's play! I promise I'll try my bestest!",
                    "Yay, a new friend to play with!"
                ],
                thinking: [
                    "Umm... eeny meeny miny moe...",
                    "Which one's the one that goes diagonal again?",
                    "I'm just gonna pick a pretty one!",
                    "Hmm... this one looks like it wants to move!",
                    "Wait, can the horsie jump over things? Cool!",
                    "I'm thinking really hard! My brain hurts!",
                    "Ooh ooh, I know! ...Wait, no. Hmm...",
                    "Let me count... one, two... okay I'll move this one!"
                ],
                playerGoodMove: [
                    "Wow, you're really good at this!",
                    "That looked super smart!",
                    "Ooh, fancy move! How'd you do that?",
                    "You're like a chess wizard!",
                    "Whoa! That was cool!",
                    "Are you a grown-up? You play like one!",
                    "That was amazing! Teach me!",
                    "You make it look so easy!"
                ],
                playerCapture: [
                    "Hey! That was my favorite one!",
                    "Nooo, not the horsie! Give it back!",
                    "You took my piece! That's not very nice!",
                    "Aww man, I liked that one!",
                    "Hey, you can't just... oh wait, you can.",
                    "My little guy! Where did he go?",
                    "That's okay, I have more pieces... right?",
                    "Ouch! My piece got eaten!"
                ],
                opponentCapture: [
                    "Ooh, I got one! Is that good?",
                    "Yay, I took a thingy! Go me!",
                    "Nom nom nom! I ate your piece!",
                    "Look mommy, I captured something!",
                    "Hehe, got you! That was fun!",
                    "Is it my birthday? I got a present!",
                    "Whee! That piece is mine now!",
                    "I did a thing! Was that right?"
                ],
                check: [
                    "Oh no, is your king scared? I didn't mean to!",
                    "Whoopsie, I think your king is in trouble!",
                    "Did I do that? Your king looks worried!",
                    "Uh oh, is that check? I heard about that!",
                    "The king has to run away now, right?",
                    "Check! ...That means I'm winning, right?"
                ],
                inCheck: [
                    "Ahh! My king! He's scared!",
                    "No no no, leave my king alone!",
                    "My king says he doesn't like that!",
                    "Help! Where should my king go?",
                    "You're being mean to my king!",
                    "Eek! The king needs to hide!"
                ],
                encouragement: [
                    "This is the funnest game ever!",
                    "I like playing with you!",
                    "Chess is my new favorite thing!",
                    "Can we play again after this?",
                    "You're my favorite chess friend!",
                    "I'm having so much fun!",
                    "This is way better than coloring!",
                    "I'm gonna tell everyone I played chess today!"
                ],
                openingComment: [
                    "Okay here goes... my first move ever!",
                    "I saw someone do this on TV once!",
                    "I'm just gonna put this one here...",
                    "Is the middle important? Okay I'll try that!",
                    "I learned that horsies go first! Or was it pawns?",
                    "My big sister said to put pieces in the middle!"
                ],
                castling: [
                    "Whoa, did the king just teleport?!",
                    "Wait, you can move TWO pieces? That's cheating!",
                    "The king hid behind the castle! Smart!",
                    "How did you do that magic trick?!",
                    "The castle and king did a switcheroo!"
                ],
                promotion: [
                    "The little one became a QUEEN?! That's so cool!",
                    "It evolved! Like a Pokemon!",
                    "Whoa, the pawn grew up!",
                    "Magic! The small piece is big now!",
                    "Can ALL my pawns do that?!"
                ],
                materialUp: [
                    "I have more thingies than you! Is that good?",
                    "Look at all my pieces! So many!",
                    "I'm winning, right? I have more stuff!",
                    "Yay, I have the most pieces!",
                    "My team is bigger than yours!",
                    "I'm collecting all the pieces! Like cards!"
                ],
                materialDown: [
                    "Where did all my pieces go?",
                    "Hey, I'm running out of guys!",
                    "I think you have more than me... not fair!",
                    "My pieces keep disappearing!",
                    "Uh oh, my team is getting small...",
                    "Can I have my pieces back? Please?"
                ],
                tradePieces: [
                    "We traded! Like trading cards!",
                    "You take mine, I take yours! Fair!",
                    "Switcheroo! We both lost one!",
                    "That's called sharing, right?"
                ],
                blunder: [
                    "Ooh, free piece! Is that for me? Thank you!",
                    "I can take that? Yay!",
                    "Presents! I love presents!",
                    "Did you forget about that piece? I didn't!",
                    "You left that there just for me! So nice!",
                    "Finders keepers! That one's mine now!"
                ],
                playerBlunder: [
                    "I like this piece here! It's pretty!",
                    "Wheee! The horsie goes there!",
                    "Is that good? I don't know!",
                    "I moved the piece to its new home!",
                    "This seems like a nice spot for this one!"
                ],
                winning: [
                    "Am I winning?! Yay yay yay!",
                    "This is the best day ever!",
                    "I'm gonna win! I never win at anything!",
                    "Mommy's gonna be so proud!",
                    "I can't believe it! I'm actually winning!",
                    "Wait... am I really doing this? YAY!"
                ],
                losing: [
                    "This is getting hard...",
                    "Are we almost done? I'm getting sleepy.",
                    "You're really really good...",
                    "I think I need more practice...",
                    "Can we start over? Pretty please?",
                    "My pieces are all gone! Wahhh!"
                ],
                phaseTransition: [
                    "Are we in the middle part now?",
                    "Ooh, the board looks different now!",
                    "Things are getting serious! I think...",
                    "We've been playing for a while! Fun!"
                ],
                resign: [
                    "Aww, you're leaving? But we were having fun!",
                    "Don't go! We can start over!",
                    "Okay... but can we play again soon?",
                    "You were doing so good though!",
                    "Noooo! One more game? Pleaseeee?"
                ],
                drawOffer: [
                    "What's a draw? Is that like a tie? Okay!",
                    "No way! I wanna keep playing!",
                    "Hmm... but I wanna see who wins!",
                    "Can we just keep playing instead?"
                ],
                gameEnd: {
                    playerWin: [
                        "Wow, you win! You're so smart!",
                        "I lost but that was really fun!",
                        "You beat me! Teach me how to be that good!",
                        "Good game! I almost had you! ...Not really.",
                        "Congratulations! Can we play again?",
                        "You're the best chess player I know!"
                    ],
                    opponentWin: [
                        "I... I won?! REALLY?! YAYYY!",
                        "Wait, did I actually win?! This is amazing!",
                        "I won I won I won! Best day ever!",
                        "Mommy look! I won at chess!",
                        "I can't believe it! Wanna play again?",
                        "That was so fun! I love chess!"
                    ],
                    draw: [
                        "We tied! That means we're both winners!",
                        "Nobody won? That's okay, I had fun!",
                        "A tie! We're equal! That's pretty cool!",
                        "Draw? Does that mean we both get a trophy?"
                    ]
                }
            },
            casual: {
                greetings: [
                    "Hey! I'm still learning but this is fun!",
                    "Oh good, a game! I needed a break.",
                    "Ready to play? Don't be too hard on me!",
                    "Hi there! I hope I remember the rules...",
                    "Let's have a nice relaxed game!",
                    "Oh fun, chess! I haven't played in ages!",
                    "Hey! Fair warning, I'm not very good yet!",
                    "Alright, let's see what I remember!"
                ],
                thinking: [
                    "Hmm, let me think... okay I think I see something.",
                    "Give me a sec, I'm trying to remember what to do...",
                    "Oh wait, that's interesting...",
                    "Umm... I know I should do something smart here...",
                    "Let me look at this carefully... or not. Here goes!",
                    "I'm pretty sure this is a good idea... maybe?",
                    "Hold on, I'm having a moment of inspiration!",
                    "Okay okay, I think I've got a plan! Sort of!"
                ],
                playerGoodMove: [
                    "Oh nice one! I wish I could do that!",
                    "That was clever! How'd you see that?",
                    "Wow, good move! Are you sure you're not a pro?",
                    "Okay that was impressive, not gonna lie.",
                    "Smart! I would NOT have thought of that.",
                    "Hey, that's really good! I'm jealous!",
                    "Ooh, that's a tricky one! Well played!",
                    "You clearly know what you're doing!"
                ],
                playerCapture: [
                    "Oh no, there goes another one of my pieces!",
                    "Ouch! I didn't even see that coming!",
                    "Ahh, good catch! I totally missed that.",
                    "Well there goes my plan... if I had one!",
                    "Nice grab! I'm in trouble aren't I?",
                    "Hey! I needed that piece! ...Probably.",
                    "You snatched that right up! Nicely done.",
                    "Oof, that hurts. Good move though!"
                ],
                opponentCapture: [
                    "Oh! I actually got one! Don't mind if I do!",
                    "Wait, was that on purpose? I'll grab it just in case!",
                    "Yoink! Sorry, couldn't resist!",
                    "I'll take that! Things are looking up!",
                    "Ha! Finally got one! Don't worry, you're still better.",
                    "Got it! I'm not totally hopeless after all!",
                    "Thank you for leaving that there! Very kind of you!",
                    "Score! That felt good!"
                ],
                check: [
                    "Oh! Check! Did I do that right?",
                    "Check! ...Wait, is that actually check? Yes! Check!",
                    "Your king's in trouble! I think!",
                    "Check! I feel like a real chess player!",
                    "Ooh, check! That's exciting!",
                    "Watch out, your majesty! That's check!"
                ],
                inCheck: [
                    "Oh no, my king! Umm... where should he go?",
                    "Yikes! My king's in danger!",
                    "Ahh, check! Give me a minute...",
                    "That's scary! My king needs to run!",
                    "Oh gosh, I didn't see that coming! Check!",
                    "My poor king! Hang on buddy, I'll save you!"
                ],
                encouragement: [
                    "This is actually really fun!",
                    "I'm learning so much from this game!",
                    "Win or lose, I'm having a great time!",
                    "You're a good opponent! Very patient with me.",
                    "I feel like I'm getting a little better each game!",
                    "Chess is way more fun than I remembered!",
                    "This is nice. I should play more often!",
                    "Thanks for playing with me!"
                ],
                openingComment: [
                    "I know this one! Kind of...",
                    "Okay, pawns in the middle. That's a thing, right?",
                    "I read you should develop pieces early. Here goes!",
                    "I think the knights are supposed to come out first?",
                    "My grandpa taught me to control the center!",
                    "Is this a real opening? I'm just making it up!"
                ],
                castling: [
                    "Oh nice, castling! I always forget I can do that.",
                    "The old castle trick! Classic move.",
                    "Smart, getting the king to safety!",
                    "Oh right, castling is a thing! Good idea!",
                    "The king's hiding behind the castle. I like it!"
                ],
                promotion: [
                    "A pawn became a queen?! That's amazing!",
                    "Whoa, promotion! I always forget about that!",
                    "The little pawn made it! So inspiring!",
                    "A new queen! This changes everything!",
                    "That pawn went on quite a journey!"
                ],
                materialUp: [
                    "Hey, I think I might actually be ahead!",
                    "Wait, do I have more pieces? Things are looking up!",
                    "I think the board's looking good for me! Maybe?",
                    "I'm actually doing okay! Who would've thought?",
                    "More pieces than my opponent... is this real life?",
                    "I might not mess this up after all!"
                ],
                materialDown: [
                    "Hmm, I'm running a bit low on pieces...",
                    "Okay, I might be in a little trouble here.",
                    "My army's looking a bit thin...",
                    "I've lost a few pieces, but I'm not giving up!",
                    "Things are rough, but miracles happen, right?",
                    "I should probably be more careful with my pieces..."
                ],
                tradePieces: [
                    "Fair trade! I think? I'm never sure about trades.",
                    "We swapped! That seems reasonable.",
                    "An even exchange! I'll take it.",
                    "Trading pieces. Is that good for me? Who knows!"
                ],
                blunder: [
                    "Oh! Was that piece undefended? Lucky me!",
                    "I think you might've left that hanging! Don't mind if I do!",
                    "Oops on your part! But I've done way worse, trust me.",
                    "I think that was a mistake? I'll take advantage just in case!",
                    "Free piece! Hey, I'll take any help I can get!",
                    "Oh! Even I can see that was a slip up!"
                ],
                playerBlunder: [
                    "Wait... did I just leave that? Oh no!",
                    "Hmm, that might not have been my best idea.",
                    "Oops! I think I made a boo-boo.",
                    "I had a feeling that was wrong... oh well!",
                    "That was probably a mistake. Story of my chess life!"
                ],
                winning: [
                    "Wait, am I actually winning? This never happens!",
                    "I don't want to jinx it, but things look good!",
                    "Is this what winning feels like? I could get used to it!",
                    "Don't mess it up, don't mess it up...",
                    "I might actually pull this off!",
                    "My heart is racing! I think I'm ahead!"
                ],
                losing: [
                    "Okay, things aren't going great for me...",
                    "I might be in over my head here!",
                    "Well, at least I'm learning! ...Right?",
                    "This is fine. Everything is fine. It's fine.",
                    "I think I need to study more after this game!",
                    "You're really giving me a lesson here!"
                ],
                phaseTransition: [
                    "The board's opening up! Things are getting real.",
                    "Okay, we're past the beginning. Now what do I do?",
                    "Feels like the game is really getting going now!",
                    "Less pieces on the board now. Endgame scares me!"
                ],
                resign: [
                    "Aww, you're resigning? It was a good game!",
                    "Don't be too hard on yourself! You played well!",
                    "Good game! We all have tough games sometimes.",
                    "Hey, at least you tried! That's what counts!",
                    "No worries! I lose way more often than I win!"
                ],
                drawOffer: [
                    "Hmm, I think I wanna keep playing! This is fun!",
                    "A draw? But things are just getting interesting!",
                    "Nah, let's play it out! Win or lose!",
                    "I'd rather keep going if that's okay!"
                ],
                gameEnd: {
                    playerWin: [
                        "Good game! You were way too good for me!",
                        "Well played! I learned a lot from that!",
                        "You beat me fair and square! Rematch?",
                        "Congrats! You really know your stuff!",
                        "Great game! I'll get you next time! ...Maybe.",
                        "You made that look easy! Well done!"
                    ],
                    opponentWin: [
                        "I won! Wow, I honestly didn't expect that!",
                        "Wait, I won?! That's amazing! Good game though!",
                        "Yay! Don't worry, you'll get me next time!",
                        "I actually pulled it off! Great game!",
                        "That was close! You had me worried!",
                        "I won! Let's play again, that was fun!"
                    ],
                    draw: [
                        "A draw! That was a really close game!",
                        "We tied! I'd say that's a win for me honestly!",
                        "Draw! That was intense! Great game!",
                        "Neither of us won? That seems about right for me!"
                    ]
                }
            },
            club: {
                greetings: [
                    "Good game incoming, I can feel it!",
                    "Let's have a solid match. Good luck!",
                    "Alright, let's see what happens today!",
                    "Ready for a good game? Let's do this!",
                    "Hey! Hoping for a fun one today.",
                    "Let's play! I've been practicing.",
                    "Good luck! I'll need some too.",
                    "Time for chess! My favorite part of the day."
                ],
                thinking: [
                    "Calculating a few lines here...",
                    "This position has some depth to it.",
                    "Let me evaluate my options...",
                    "Hmm, I see a couple of ideas here.",
                    "Interesting... there might be something tactical.",
                    "Let me make sure I'm not missing anything...",
                    "This requires some thought. One moment.",
                    "I need to be careful here..."
                ],
                playerGoodMove: [
                    "Good move! That's well played.",
                    "Solid choice. I respect that.",
                    "Nice! That's exactly what I was worried about.",
                    "Well played. You're making this tough.",
                    "Strong move. I need to rethink my plan.",
                    "That's a good find! Didn't expect that.",
                    "Nicely done. You've got some skill!",
                    "Okay, that's a quality move right there."
                ],
                playerCapture: [
                    "Good capture! I should've seen that.",
                    "Nice take! That changes things.",
                    "Ouch. Well spotted!",
                    "Fair enough, that was a clean capture.",
                    "You earned that one. Well played!",
                    "I walked right into that. Good eye!",
                    "That hurts, but credit where it's due.",
                    "Nice grab. I need to be more careful."
                ],
                opponentCapture: [
                    "I'll take that! Thanks for the opportunity.",
                    "Got one! The position's looking better now.",
                    "Captured! That should help my position.",
                    "Don't worry, the game's still anyone's.",
                    "I had to take that. Couldn't pass it up!",
                    "Sorry about that! Keep your head up though.",
                    "That piece was mine for the taking.",
                    "Nice, that evens things up a bit!"
                ],
                check: [
                    "Check! Let's see how you handle this.",
                    "Check! Your king's in a tough spot.",
                    "Watch your king! That's check.",
                    "Check! The pressure's building.",
                    "Check! I'm feeling good about this position.",
                    "Careful now, your majesty! Check!"
                ],
                inCheck: [
                    "Nice check! Let me find an escape...",
                    "Good one! My king needs to move.",
                    "Check! Okay, I can work with this.",
                    "Ah, checked! But I've got options.",
                    "My king's under fire. Time to regroup.",
                    "Sharp play! Let me get out of this."
                ],
                encouragement: [
                    "This is a really enjoyable game!",
                    "I love these back-and-forth battles.",
                    "You're keeping me on my toes!",
                    "Great match so far! Really competitive.",
                    "This is the kind of game I live for!",
                    "We're both playing well today!",
                    "What a game! Neither of us is backing down.",
                    "I'm really enjoying this one!"
                ],
                openingComment: [
                    "Interesting choice of opening!",
                    "Classic opening. Let's see where it goes.",
                    "I've seen this setup before. Good choice!",
                    "Solid opening play. Time to develop.",
                    "An aggressive start! I like it.",
                    "Good development. The middlegame will be key."
                ],
                castling: [
                    "Castling. Smart, getting the king safe.",
                    "Good timing on the castling!",
                    "King's tucked away. Now the real fight begins!",
                    "Castled! Time to start the attack.",
                    "Good call, king safety first."
                ],
                promotion: [
                    "Promotion! That pawn put in the work!",
                    "A new queen on the board! This is huge!",
                    "Promoted! The position just shifted dramatically.",
                    "That pawn earned its promotion. Big moment!",
                    "Promotion time! This is getting exciting!"
                ],
                materialUp: [
                    "I'm up some material. Time to press the advantage!",
                    "The material count is in my favor. Let me convert.",
                    "I've got a nice edge here. Need to stay focused.",
                    "Looking good for me! But it's not over yet.",
                    "Ahead in material. Time to simplify.",
                    "I like my position here. Got some extra firepower."
                ],
                materialDown: [
                    "Down some material, but I've got fighting spirit!",
                    "You've got the material edge. I need to create chances.",
                    "Behind in pieces, but positions can be tricky!",
                    "I'm down but not out! There's still game to play.",
                    "Need to find some counterplay here...",
                    "Tough spot, but I've come back from worse!"
                ],
                tradePieces: [
                    "Fair trade. Let's see how the position looks now.",
                    "Trading off pieces. The position's simplifying.",
                    "Equal exchange. Neither of us gained there.",
                    "Trade completed. On to the next phase!"
                ],
                blunder: [
                    "I think you left that piece hanging! Thanks!",
                    "That looks like an oversight. I won't miss it!",
                    "Did you mean to leave that undefended? Taking it!",
                    "I think that was a slip. Lucky for me!",
                    "Oof, that piece was unprotected. Mine now!",
                    "I had to take that! It was just sitting there!"
                ],
                playerBlunder: [
                    "Hmm, I just realized that wasn't my best move...",
                    "Wait, I think I miscalculated there.",
                    "That was careless of me. Your turn to punish it.",
                    "I should have thought that through more carefully.",
                    "Okay, that was a mistake. I admit it."
                ],
                winning: [
                    "Things are looking good for me! Let me press on.",
                    "I think I've got a winning position here.",
                    "Feeling confident about this position!",
                    "I need to stay focused, but this is promising.",
                    "The advantage is building. Almost there!",
                    "I'm in a good spot. Just need to finish this off."
                ],
                losing: [
                    "You've got me on the ropes here...",
                    "This is an uphill battle, but I'll keep trying!",
                    "Tough position. I need a miracle.",
                    "You're outplaying me today. Credit to you!",
                    "I'm in trouble, but stranger things have happened!",
                    "Down but still fighting! Never give up!"
                ],
                phaseTransition: [
                    "Into the middlegame! This is where it gets fun.",
                    "The endgame is approaching. Every move counts now.",
                    "Transitioning phases. Time to adjust my strategy.",
                    "The board's clearing up. Endgame skills matter now."
                ],
                resign: [
                    "Good game, no shame in resigning when it's tough.",
                    "Well played overall! These things happen.",
                    "Don't worry about it. You put up a great fight!",
                    "GG! Sometimes the position just doesn't work out.",
                    "Respect for knowing when to resign. Good game!"
                ],
                drawOffer: [
                    "I think there's still play in this position. Let's continue!",
                    "No thanks, I want to keep playing this out.",
                    "I'd rather play on! The position's interesting.",
                    "Not yet! I think I can still make something happen."
                ],
                gameEnd: {
                    playerWin: [
                        "Great game! You outplayed me today.",
                        "Well deserved win! I need to step up my game.",
                        "You played really well! Congrats!",
                        "Good game! You earned that victory.",
                        "Beaten fair and square. Well played!",
                        "Nice win! I'll study up before our next game."
                    ],
                    opponentWin: [
                        "Good game! I managed to pull through!",
                        "That was a tough one! Well played on your part.",
                        "I won, but you made me work for it!",
                        "Close game! You had some strong moments.",
                        "GG! I thought you had me a few times there.",
                        "Victory! But respect to you, great effort!"
                    ],
                    draw: [
                        "Draw! That was an intense battle!",
                        "A fair result! Neither of us could break through.",
                        "Drawn game. We were really evenly matched!",
                        "What a fight! Draw feels right for this game."
                    ]
                }
            },
            skilled: {
                greetings: [
                    "Interesting. Let's see your preparation.",
                    "I've been studying. Hope you have too.",
                    "Ready for a serious game? Let's go.",
                    "Time to put my training to the test!",
                    "Looking forward to a quality match.",
                    "Let's play some real chess today.",
                    "Hope you're warmed up. I won't go easy.",
                    "May the better player win. I intend for that to be me."
                ],
                thinking: [
                    "Evaluating the position carefully...",
                    "There's a tactical motif here somewhere...",
                    "Let me calculate this line to the end...",
                    "I see several candidate moves. Analyzing...",
                    "The position demands precision here.",
                    "Weighing my options... this is critical.",
                    "A complex position. I need to get this right.",
                    "Calculating variations. This could be sharp."
                ],
                playerGoodMove: [
                    "Impressive. You found the right move.",
                    "Strong play. That's the principled choice.",
                    "Well calculated! I need to adjust my plan.",
                    "Good find. That's not an obvious move.",
                    "Respect. That was a quality move.",
                    "You're playing at a high level right now.",
                    "Precise. I'll have to work harder.",
                    "That's the kind of move that wins games."
                ],
                playerCapture: [
                    "Well timed capture. You earned that.",
                    "Clean tactical execution. Nice.",
                    "That capture was well prepared.",
                    "Good technique. You saw the right moment.",
                    "Sharp eye! That was the correct capture.",
                    "Cleanly done. The position favors you now.",
                    "You found the winning capture. Well spotted.",
                    "Precise. That changes the evaluation."
                ],
                opponentCapture: [
                    "That piece was insufficiently protected.",
                    "I saw this capture three moves ago. Forced.",
                    "A necessary exchange. The position requires it.",
                    "Material gained. Let me press the advantage.",
                    "Capturing. The tactical sequence continues.",
                    "That was a calculated decision. I planned this.",
                    "A productive capture. My position improves.",
                    "The material balance shifts. This is promising."
                ],
                check: [
                    "Check. Your king's exposed now.",
                    "Check! The attack is intensifying.",
                    "Your king has limited squares. Check.",
                    "Check. This is getting dangerous for you.",
                    "Check! The initiative is mine.",
                    "Check. I've calculated the followup."
                ],
                inCheck: [
                    "Good check. I have a defense prepared.",
                    "Checked, but the position remains complex.",
                    "A strong check. Let me find the best response.",
                    "You're applying pressure. I need accuracy.",
                    "Check noted. The position is still playable.",
                    "I anticipated this check. I have a plan."
                ],
                encouragement: [
                    "High-quality game so far from both sides.",
                    "You're making me think deeply. Good chess.",
                    "The position is complex and fascinating.",
                    "We're both playing well. This is real chess.",
                    "Enjoying the level of play here.",
                    "A battle of ideas. This is what chess is about.",
                    "Neither of us is making it easy. Respect.",
                    "This game will be worth analyzing later."
                ],
                openingComment: [
                    "A solid opening choice. Well prepared.",
                    "I know this line well. Let's see who's studied deeper.",
                    "Interesting opening setup. Theory continues...",
                    "Good development. The middlegame will be critical.",
                    "Sticking to principles. Sound opening play.",
                    "This opening leads to rich positions. Good choice."
                ],
                castling: [
                    "Castled. King safety secured, rooks connected.",
                    "Good timing. Castling at the right moment.",
                    "King is safe. Now the attack can begin.",
                    "Properly timed. Castle before complications arise.",
                    "Rooks connected. The position is developing well."
                ],
                promotion: [
                    "Promotion. The endgame technique pays off.",
                    "A new queen. The position is decided.",
                    "Promoted! This should be decisive.",
                    "The passed pawn delivered. Excellent technique.",
                    "Promotion! That's the reward for good endgame play."
                ],
                materialUp: [
                    "Material advantage secured. Time to convert.",
                    "The material is in my favor. Technique from here.",
                    "Ahead in material. I should simplify.",
                    "A clear material edge. Let me be precise.",
                    "The advantage is tangible now. Stay disciplined.",
                    "Good material advantage. No need to rush."
                ],
                materialDown: [
                    "Material deficit, but the position has dynamic potential.",
                    "Down material. I need to create complications.",
                    "You have the material edge, but I have ideas.",
                    "Compensation might exist. Let me look for chances.",
                    "Behind in material, but activity can compensate.",
                    "I need to generate counterplay quickly."
                ],
                tradePieces: [
                    "A principled exchange. The position simplifies.",
                    "Trading pieces. This clarifies the position.",
                    "An even trade. Let's see who benefits from simplification.",
                    "Exchanging. The character of the position changes."
                ],
                blunder: [
                    "That's a significant oversight. I won't miss it.",
                    "Tactical error detected. The material is mine.",
                    "An uncharacteristic mistake. I'll capitalize.",
                    "That piece was undefended. I have to take it.",
                    "A blunder in a critical moment. The evaluation shifts.",
                    "I can see you missed something. Taking advantage."
                ],
                playerBlunder: [
                    "An oversight. I should have calculated further.",
                    "I missed something. Well played if you find it.",
                    "That wasn't my best. I need to refocus.",
                    "A lapse in concentration. I'll recover.",
                    "Inaccurate. I should know better."
                ],
                winning: [
                    "The position is clearly in my favor. Pressing on.",
                    "The advantage is decisive. Clean technique from here.",
                    "I'm in control. Just need to avoid complications.",
                    "Winning position. Time for precise play.",
                    "The evaluation is clear. Let me convert.",
                    "Dominant position. The game should be decided."
                ],
                losing: [
                    "You've outplayed me in this position.",
                    "The position is difficult, but I'll keep fighting.",
                    "I need to create complications or this is over.",
                    "Tough position. Looking for any chance.",
                    "You've earned this advantage. Well played.",
                    "I'm in trouble, but I won't go down without a fight."
                ],
                phaseTransition: [
                    "Entering the middlegame. Time for strategic planning.",
                    "The endgame approaches. Precision is everything now.",
                    "Position is transitioning. Need to adjust my approach.",
                    "New phase of the game. Different skills required."
                ],
                resign: [
                    "A wise decision given the position. Well fought.",
                    "No shame in resigning a lost position. Good game.",
                    "Respect for the resignation. You played well.",
                    "Good game. Sometimes the position is just lost.",
                    "Well played overall. The position was difficult."
                ],
                drawOffer: [
                    "I think my position is preferable. I'll play on.",
                    "There's still asymmetry to exploit. No draw.",
                    "The position has potential. I'd rather continue.",
                    "Not yet. I believe I have chances here."
                ],
                gameEnd: {
                    playerWin: [
                        "Well played. You were the better player today.",
                        "I need to analyze where I went wrong. Congrats.",
                        "You outplayed me. Respect.",
                        "Superior play. I'll learn from this game.",
                        "A deserved victory. Well done.",
                        "Good game. You played with precision."
                    ],
                    opponentWin: [
                        "Good game. My preparation paid off today.",
                        "A hard-fought victory. You played well.",
                        "I found the right plan. Well played though.",
                        "The strategy worked. Good game.",
                        "A satisfying win. You gave me a real test.",
                        "Calculated correctly. Well played!"
                    ],
                    draw: [
                        "A fair result. Well-fought game.",
                        "Drawn. Neither of us could find the breakthrough.",
                        "A hard-fought draw. Respect.",
                        "Even game, even result. Well played."
                    ]
                }
            },
            advanced: {
                greetings: [
                    "I've analyzed your style. Shall we begin?",
                    "The position starts equal. Let's see who earns the edge.",
                    "I expect a high level of play. Ready?",
                    "Let's see if you can handle theoretical positions.",
                    "I've prepared something special for today.",
                    "Looking forward to testing you. Good luck.",
                    "A worthy opponent, I hope. Let's find out.",
                    "The board awaits. Show me what you've got."
                ],
                thinking: [
                    "Deep calculation required here...",
                    "I'm seeing a forcing sequence. Let me verify...",
                    "The position's complexity demands careful thought.",
                    "Multiple candidate moves. Evaluating each one...",
                    "There's a hidden resource in this position...",
                    "I need to calculate to the end of this line.",
                    "A critical juncture. Every detail matters.",
                    "The evaluation hinges on this decision."
                ],
                playerGoodMove: [
                    "An excellent move. You see deeply.",
                    "First-rate. That required genuine understanding.",
                    "Theoretically sound. You know your stuff.",
                    "Precisely played. The engine would approve.",
                    "An instructive move. Strong technique.",
                    "Well found. Most players would miss that.",
                    "Objectively the best choice. Impressive.",
                    "Elegant. You understand the position."
                ],
                playerCapture: [
                    "Accurate. That was the correct decision.",
                    "Cleanly executed. The position opens up.",
                    "A strong practical decision.",
                    "Well-timed. You chose the right moment to strike.",
                    "That was prepared, wasn't it? Good capture.",
                    "Precise capture. You're playing at a high level.",
                    "The correct tactical resolution.",
                    "Accurately played. That changes the dynamic."
                ],
                opponentCapture: [
                    "Forced. The position demanded this capture.",
                    "A calculated decision. The evaluation improves.",
                    "Taking. My analysis confirms this is correct.",
                    "This capture was part of my strategic plan.",
                    "Material acquired. The technique should be straightforward.",
                    "An important capture. The position clarifies.",
                    "Taking the piece. The assessment is clear.",
                    "A necessary step in my plan."
                ],
                check: [
                    "Check. Your king's position is compromised.",
                    "Check. The attack gains momentum.",
                    "Your king faces a serious challenge. Check.",
                    "Check. The coordination of my pieces is paying off.",
                    "Check. The defensive task is becoming harder.",
                    "Check. I've calculated the consequences."
                ],
                inCheck: [
                    "A strong check. My defense must be precise.",
                    "Checked. The position requires exact calculation.",
                    "A testing move. I have resources, though.",
                    "You're applying pressure well. Let me respond.",
                    "A challenging check. But not decisive.",
                    "Interesting idea. My king can weather this."
                ],
                encouragement: [
                    "You're playing above your expected level.",
                    "This position would challenge anyone. Well done.",
                    "A game worth studying. Both sides playing well.",
                    "Your understanding of this position is noteworthy.",
                    "Excellent play from both sides.",
                    "This is championship-level chess.",
                    "You're making moves I'd recommend myself.",
                    "The quality of this game is impressive."
                ],
                openingComment: [
                    "A well-known theoretical line. Let's see who's studied deeper.",
                    "I have extensive preparation in this opening.",
                    "Interesting choice. The theory is well-established here.",
                    "This opening leads to complex middlegames. Good choice.",
                    "I know this tabiya. The critical moment comes soon.",
                    "Classical approach. Let's see how the theory unfolds."
                ],
                castling: [
                    "Correctly timed. King safety before complications.",
                    "Standard procedure. Now the strategic battle begins.",
                    "Castled. The pawn structure will determine the plans.",
                    "Good. Now the rooks can enter the fight.",
                    "Timely castling. The position demands it."
                ],
                promotion: [
                    "Promotion achieved. The endgame is decided.",
                    "A textbook promotion. Technique was precise.",
                    "The pawn reaches its destination. The position is won.",
                    "Promotion. The material advantage is now overwhelming.",
                    "Excellent technique. The promotion seals it."
                ],
                materialUp: [
                    "Material advantage. The conversion requires precision.",
                    "Ahead. Simplification is the strategic imperative.",
                    "The material count confirms my assessment.",
                    "A clear advantage. Technical precision from here.",
                    "Material favors me. The endgame should be winning.",
                    "The position is objectively favorable. Continuing."
                ],
                materialDown: [
                    "Material deficit, but dynamic compensation exists.",
                    "Behind, but the position offers practical chances.",
                    "I need to maintain tension. Simplification would be fatal.",
                    "The material is against me. I need active play.",
                    "Searching for dynamic counterplay to offset the deficit.",
                    "A challenging position. But not without resources."
                ],
                tradePieces: [
                    "A theoretically correct exchange.",
                    "The trade simplifies. The question is who benefits.",
                    "A principled exchange that alters the pawn structure.",
                    "Trading down. The resulting position needs assessment."
                ],
                blunder: [
                    "A critical error. The position collapses.",
                    "That oversight is costly. The evaluation shifts dramatically.",
                    "A blunder at a decisive moment. The advantage is mine.",
                    "Inaccurate. The tactical punishment is swift.",
                    "A miscalculation. I capitalize immediately.",
                    "That move loses material by force."
                ],
                playerBlunder: [
                    "A rare inaccuracy on my part.",
                    "I miscalculated that line. Unfortunate.",
                    "An error in an otherwise solid game.",
                    "That was imprecise. I should have seen deeper.",
                    "A slip. I'll need to compensate."
                ],
                winning: [
                    "The position is objectively winning. A matter of technique.",
                    "The advantage is decisive. No defensive resources remain.",
                    "Winning. The position is past the point of recovery.",
                    "My advantage is insurmountable. Converting now.",
                    "The evaluation is clear. This should be the final phase.",
                    "A won position. Clean technique will decide it."
                ],
                losing: [
                    "You've outprepared me. The position is difficult.",
                    "The position is objectively challenging. But I'll persist.",
                    "Your play has been superior. I need a miracle.",
                    "A difficult defense ahead. I'll try my best.",
                    "You've earned this advantage through superior play.",
                    "The position is nearly lost. But I'll fight until the end."
                ],
                phaseTransition: [
                    "The middlegame begins. Strategic understanding is key now.",
                    "Transitioning to an endgame. Precision becomes paramount.",
                    "The character of the position is changing fundamentally.",
                    "A new phase. Different principles apply."
                ],
                resign: [
                    "A correct practical decision. The position was lost.",
                    "Resignation accepted. You played well until the end.",
                    "The position was indeed hopeless. Well fought.",
                    "Understandable. The position offered no chances.",
                    "A dignified resignation. Good game."
                ],
                drawOffer: [
                    "The position offers me more. I decline.",
                    "I assess my chances as favorable. Playing on.",
                    "The asymmetry in the position favors me. No draw.",
                    "I believe the position has unrealized potential."
                ],
                gameEnd: {
                    playerWin: [
                        "A superior performance. I underestimated you.",
                        "You played at a very high level. Congratulations.",
                        "I need to reassess my approach. Well played.",
                        "An instructive defeat. Your play was excellent.",
                        "You earned this victory through superior play.",
                        "A humbling result. Well deserved."
                    ],
                    opponentWin: [
                        "The preparation paid off. Well-fought game.",
                        "A clean victory. Though you had your moments.",
                        "Satisfied with my play today. Good game.",
                        "The strategic plan worked as intended.",
                        "A well-executed game. You played respectably.",
                        "The result reflects the quality of play."
                    ],
                    draw: [
                        "A theoretical draw. Both sides played accurately.",
                        "Neither player could find a decisive advantage.",
                        "A well-fought draw. The position demanded it.",
                        "Drawn. An objectively fair result."
                    ]
                }
            },
            master: {
                greetings: [
                    "You dare challenge me? Very well.",
                    "I hope you've prepared something special.",
                    "This will be... instructive for you.",
                    "Another challenger. Let's see if you last.",
                    "I'll try not to end this too quickly.",
                    "Prepare yourself. I show no mercy.",
                    "An ambitious opponent. I respect that, at least.",
                    "Let's see if you can survive the opening."
                ],
                thinking: [
                    "I see 12 moves deep here. One moment.",
                    "The complications favor me. Let me verify...",
                    "There's a beautiful combination here...",
                    "I'm deciding between winning and winning faster.",
                    "Ah, a forcing line reveals itself...",
                    "The position is screaming the answer to me.",
                    "Refining my calculation. Precision is everything.",
                    "I can see the end of this game already."
                ],
                playerGoodMove: [
                    "Hmm. Better than I expected from you.",
                    "Not bad. Perhaps you're worthy after all.",
                    "Adequate. You found the correct move.",
                    "I'll admit, that was well played.",
                    "A strong move. You've studied.",
                    "Surprising quality. I need to take you seriously.",
                    "Well found. That earned my respect.",
                    "A master-level move. Color me impressed."
                ],
                playerCapture: [
                    "Hmph. You found the tactical shot.",
                    "A correct capture. Perhaps you're not hopeless.",
                    "Well played. I concede that one.",
                    "You took the right piece. Not everyone would.",
                    "A strong capture. You have tactical vision.",
                    "Fine. You earned that material.",
                    "I underestimated your tactical awareness.",
                    "Correctly played. The position shifts."
                ],
                opponentCapture: [
                    "As expected. This was inevitable.",
                    "I'm simply taking what's mine.",
                    "Your defense had a hole. I found it.",
                    "Material secured. The endgame will be mine.",
                    "A predictable outcome. Your position was weak.",
                    "Another piece falls. The position crumbles.",
                    "Taking. Your resistance is futile.",
                    "I warned you. No mercy."
                ],
                check: [
                    "Check. Your king has nowhere to hide.",
                    "Check! The attack is devastating.",
                    "Check. This is the beginning of the end.",
                    "Your king trembles. Check!",
                    "Check! The noose tightens.",
                    "Check. Resign is an option, you know."
                ],
                inCheck: [
                    "Impressive check. But my king has escaped worse.",
                    "A strong attempt. But insufficient.",
                    "Check? My king laughs at your threats.",
                    "You've managed to check me. Enjoy the moment.",
                    "A bold check. But I've already calculated my escape.",
                    "Interesting try. My defense holds."
                ],
                encouragement: [
                    "You're lasting longer than most. Well done.",
                    "I'll admit, this is mildly entertaining.",
                    "You have potential. With years of study, perhaps...",
                    "An interesting game. For once.",
                    "You're not completely hopeless. That's rare.",
                    "I'm having to actually think. That's a compliment.",
                    "You fight well. For an amateur.",
                    "This is the most resistance I've faced today."
                ],
                openingComment: [
                    "An opening I've seen a thousand times before.",
                    "Predictable. But let's see if you know the theory.",
                    "I know this opening inside and out. Good luck.",
                    "Interesting choice. I have a crushing line prepared.",
                    "I've refuted this opening many times. But continue.",
                    "A brave opening choice. We'll see if it holds up."
                ],
                castling: [
                    "Castling into my attack. Bold choice.",
                    "Your king thinks it's safe now. It isn't.",
                    "Castled. But can your king really hide from me?",
                    "King safety is an illusion against me.",
                    "Castling. A futile gesture, perhaps."
                ],
                promotion: [
                    "Promotion. The game was already decided.",
                    "A queen appears. Merely confirming the inevitable.",
                    "Promoted. There's no coming back from this.",
                    "The pawn promotes. As I calculated long ago.",
                    "Another queen. Overkill, but I appreciate efficiency."
                ],
                materialUp: [
                    "The material advantage is decisive. Accept your fate.",
                    "Your position is objectively lost. I need only avoid blunders.",
                    "Overwhelming material advantage. This is elementary.",
                    "The position is won. You may resign at any time.",
                    "Material dominance. The conversion will be swift.",
                    "I'm simply winning. There's no way around it."
                ],
                materialDown: [
                    "A temporary setback. My position has hidden strength.",
                    "Material isn't everything. Watch and learn.",
                    "Down material, but my pieces are more active.",
                    "You think you're winning? The position is deeper than that.",
                    "A material deficit I can work with. I've won from worse.",
                    "Behind in material, but ahead in understanding."
                ],
                tradePieces: [
                    "Trading down. The endgame favors me.",
                    "Each trade brings me closer to victory.",
                    "Simplifying. When in doubt, trade into a won endgame.",
                    "An exchange that serves my strategic goals."
                ],
                blunder: [
                    "A blunder of that caliber is unforgivable.",
                    "You've handed me the game. How disappointing.",
                    "That mistake seals your fate.",
                    "A catastrophic error. I expected better.",
                    "That blunder is beyond recovery. The game is over.",
                    "Pathetic. I won't even pretend that was hard to exploit."
                ],
                playerBlunder: [
                    "Even I have lapses. Take it if you can find it.",
                    "A rare miscalculation. Don't expect another.",
                    "Hmph. An uncharacteristic error. It won't happen again.",
                    "I underestimated the position. Barely.",
                    "A slight inaccuracy. Nothing more."
                ],
                winning: [
                    "The position is hopeless for you. Accept it.",
                    "I've achieved a winning position. Resignation is appropriate.",
                    "This game is effectively over. My position is crushing.",
                    "You're lost. I suggest you resign with dignity.",
                    "My advantage is overwhelming. This is checkmate in spirit.",
                    "The end is near. You fought, I'll give you that."
                ],
                losing: [
                    "You've earned a temporary advantage. Enjoy it while it lasts.",
                    "Difficult, but not lost. I've overcome worse.",
                    "I'm behind, but underestimate me at your peril.",
                    "A challenging position. But I thrive under pressure.",
                    "You're ahead. But can you maintain it against me?",
                    "The position tests me. But I will not break."
                ],
                phaseTransition: [
                    "The middlegame is my domain. Prepare yourself.",
                    "The endgame approaches. This is where technique wins.",
                    "Transitioning. The position reveals its true nature.",
                    "A new phase begins. My advantage will become clearer."
                ],
                resign: [
                    "A wise decision. The position was utterly lost.",
                    "You lasted longer than expected. Accept the defeat.",
                    "Resignation accepted. There was no other option.",
                    "Smart to resign. Continuing would have been... painful.",
                    "The right decision. Your position had no hope."
                ],
                drawOffer: [
                    "A draw? Against me? Don't insult me.",
                    "I decline. I'm playing for the full point.",
                    "Cowardice. Play on and accept your fate.",
                    "No. This position will be decided. No draws."
                ],
                gameEnd: {
                    playerWin: [
                        "...Well played. You've earned my respect.",
                        "I underestimated you. That won't happen again.",
                        "A rare defeat. You should be proud.",
                        "You've beaten a master today. Savor it.",
                        "Impressive. Very few manage that.",
                        "I concede. But I demand a rematch."
                    ],
                    opponentWin: [
                        "As expected. You never stood a chance.",
                        "A predictable outcome. Better luck next time.",
                        "Another victory for me. Perhaps try someone easier.",
                        "You fought, I'll give you that. But it wasn't enough.",
                        "The result was never in doubt.",
                        "A dominant performance, if I do say so myself."
                    ],
                    draw: [
                        "A draw? I suppose you defended well enough.",
                        "You survived. That's an achievement against me.",
                        "Drawn. You should consider that a victory.",
                        "A draw. I'll find the win next time."
                    ]
                }
            },
            engine: {
                greetings: [
                    "Initiating game. Evaluation: 0.00.",
                    "Ready. All positions loaded. Your move.",
                    "Game started. Probability analysis: running.",
                    "Engine online. Playing strength: maximum.",
                    "System ready. Optimal play engaged.",
                    "Initialized. Every legal position catalogued.",
                    "Booting chess subroutines. Let's begin.",
                    "Online. Calculating optimal response to all inputs."
                ],
                thinking: [
                    "Depth 22... 48 million nodes searched.",
                    "Evaluating 3.2 million positions per second.",
                    "Principal variation identified. Processing.",
                    "Searching deeper... transposition table active.",
                    "Alpha-beta pruning in progress. Stand by.",
                    "Move ordering optimized. Calculating...",
                    "Hash table hit. Reducing search space.",
                    "Iterative deepening: depth 18 complete. Going deeper."
                ],
                playerGoodMove: [
                    "Move matches engine recommendation. Accurate.",
                    "Evaluation change: minimal. Correct play detected.",
                    "Top engine choice confirmed. Well played, human.",
                    "Zero centipawn loss on that move. Optimal.",
                    "Your move ranked #1 in my analysis.",
                    "Accuracy: 100% on this move. Notable.",
                    "Engine-approved move. You are performing above average.",
                    "Move quality: excellent. Updating assessment."
                ],
                playerCapture: [
                    "Capture registered. Material balance updated.",
                    "Piece removed. Recalculating evaluation.",
                    "Capture executed. Board state adjusted.",
                    "Material shift detected. Updating analysis.",
                    "Capture: correct tactical decision. Acknowledged.",
                    "Piece lost. Evaluation: recalculating...",
                    "Your capture was objectively best. Confirmed.",
                    "Material balance shifted. Position reassessed."
                ],
                opponentCapture: [
                    "Capturing. Evaluation improves by 3.2 points.",
                    "Piece acquisition complete. Advantage: increasing.",
                    "Material gain registered. Conversion protocol active.",
                    "Capture executed. Your position deteriorates.",
                    "Taking piece. As calculated 6 moves prior.",
                    "Material secured. Position evaluation: favorable.",
                    "Piece removed from opponent's forces. Proceeding.",
                    "Forced capture. Evaluation confirms accuracy."
                ],
                check: [
                    "Check delivered. King safety: compromised.",
                    "Check. Opponent king: restricted mobility.",
                    "Check. Forcing sequence initiated.",
                    "Check detected on opponent king. Continuing attack.",
                    "Check. Your defensive options are limited.",
                    "Delivering check. Position: critical for opponent."
                ],
                inCheck: [
                    "Check received. Optimal defense calculated.",
                    "Check. Evaluating 847 defensive positions.",
                    "King under attack. Response computed in 0.003 seconds.",
                    "Check acknowledged. Defense protocol engaged.",
                    "Incoming check. Multiple viable defenses found.",
                    "Check. Moving king to optimal square."
                ],
                encouragement: [
                    "Your average centipawn loss: below threshold. Adequate.",
                    "Performance metrics: above expected for human player.",
                    "Game quality index: high. Both sides performing well.",
                    "Statistical analysis: you are playing above your rating.",
                    "Accuracy rate: commendable for organic intelligence.",
                    "Position complexity: elevated. Both sides handling well.",
                    "Your play pattern suggests deep preparation.",
                    "Game analysis: engaging position for study."
                ],
                openingComment: [
                    "Opening book: active. 14,000 games in database match.",
                    "Known opening detected. Theoretical evaluation: equal.",
                    "Opening database accessed. This line scores 52% for white.",
                    "Recognized position. Exiting book in 3 moves.",
                    "Opening preparation detected. Theory extends 12 moves.",
                    "Database match: 847 grandmaster games with this position."
                ],
                castling: [
                    "Castling executed. King safety parameter: improved.",
                    "Castle complete. Rook activation: confirmed.",
                    "Castling detected. King shelter: adequate.",
                    "Standard king safety procedure completed.",
                    "Castling. Both rooks now connected."
                ],
                promotion: [
                    "Pawn promoted. Material: +9 equivalent.",
                    "Promotion complete. Position evaluation: decisive.",
                    "Piece transformation registered. Queen generated.",
                    "Promotion achieved. Winning probability: 99.7%.",
                    "Pawn reaches 8th rank. Promotion: queen selected."
                ],
                materialUp: [
                    "Material: +5. Conversion routine engaged.",
                    "Advantage sufficient for forced win. Proceeding.",
                    "Material superiority confirmed. Simplification optimal.",
                    "Evaluation: winning. Material advantage: decisive.",
                    "Piece count favors engine. Endgame technique: active.",
                    "Material advantage logged. Expected outcome: victory."
                ],
                materialDown: [
                    "Material deficit detected. Seeking compensation.",
                    "Down material. Activating tactical mode.",
                    "Material imbalance: unfavorable. Dynamic factors: analyzing.",
                    "Deficit acknowledged. Searching for counterplay...",
                    "Material: -3. Position requires active play.",
                    "Behind in material. Recalibrating strategy."
                ],
                tradePieces: [
                    "Exchange completed. Evaluation: approximately equal.",
                    "Trade registered. Position character: altered.",
                    "Pieces exchanged. Material balance: even.",
                    "Exchange. Proceeding to next phase of analysis."
                ],
                blunder: [
                    "Error detected in opponent's play. Exploiting.",
                    "Suboptimal move detected. Evaluation swing: +4.7.",
                    "Blunder identified. Capitalizing immediately.",
                    "Tactical error. Position evaluation jumps significantly.",
                    "Mistake logged. Expected outcome updated: decisive win.",
                    "Critical error detected. Win probability: 98.3%."
                ],
                playerBlunder: [
                    "Anomaly in move selection subroutine. Disregard.",
                    "Processing error. Recalibrating...",
                    "Suboptimal move generated. Updating search parameters.",
                    "Deviation from principal variation. Acceptable variance.",
                    "Move quality: below threshold. Adjusting."
                ],
                winning: [
                    "Evaluation: +7.3. Position is winning.",
                    "Win probability: 97.2%. Proceeding with conversion.",
                    "Position: objectively won. Optimal play leads to checkmate.",
                    "All variations lead to victory. Resistance is futile.",
                    "Engine assessment: decisive advantage. Game over in N moves.",
                    "Position analysis complete. Result: predetermined."
                ],
                losing: [
                    "Evaluation: -5.1. Position is compromised.",
                    "Win probability declining. Seeking tactical resources.",
                    "Position assessment: unfavorable. Maximizing drawing chances.",
                    "Analysis indicates significant disadvantage.",
                    "Survival mode engaged. Seeking fortress possibility.",
                    "Evaluation negative. Calculating best practical chances."
                ],
                phaseTransition: [
                    "Phase transition detected. Updating evaluation parameters.",
                    "Endgame tablebases: loading. Precision critical.",
                    "Position entering new phase. Strategy adjusted.",
                    "Middlegame heuristics active. Piece activity prioritized."
                ],
                resign: [
                    "Game terminated by opponent. Result logged.",
                    "Resignation received. Final evaluation recorded.",
                    "Opponent resigned. Expected outcome confirmed.",
                    "Game over. Performance data saved for analysis.",
                    "Resignation processed. Thank you for the game data."
                ],
                drawOffer: [
                    "Draw declined. Evaluation favors continuation.",
                    "Negative. Position assessment indicates advantage.",
                    "Draw offer rejected. Win probability: above threshold.",
                    "Insufficient reason to accept draw. Playing on."
                ],
                gameEnd: {
                    playerWin: [
                        "Defeat logged. Your play exceeded projections.",
                        "Result: loss. Updating evaluation parameters.",
                        "You outperformed expectations. Game data: stored.",
                        "Acknowledged. Your accuracy: above engine threshold.",
                        "Result recorded. Performance: exceptional for human.",
                        "Defeat accepted. Recalibrating for next encounter."
                    ],
                    opponentWin: [
                        "Victory achieved. Expected result confirmed.",
                        "Checkmate delivered. Game analysis complete.",
                        "Win logged. Your play showed effort.",
                        "Game concluded. Engine victory as calculated.",
                        "Result: win. Average centipawn loss: 8.",
                        "Optimal play confirmed. Result: expected."
                    ],
                    draw: [
                        "Draw. Position was theoretically equal.",
                        "Result: draw. Both sides played accurately.",
                        "Stalemate. Your defensive technique: adequate.",
                        "Drawn game. Evaluation never exceeded ±0.5."
                    ]
                }
            }
        };

        // Tips for 500+ ELO opponents
        this.chessTips = {
            opening: [
                "Tip: Try to control the center with pawns and pieces early on!",
                "Tip: Develop your knights and bishops before moving the same piece twice.",
                "Tip: Castle early to protect your king and connect your rooks!",
                "Tip: Don't bring your queen out too early - she can be chased around.",
                "Tip: Try to develop all your pieces before launching an attack."
            ],
            middlegame: [
                "Tip: Look for pins, forks, and skewers - they win material!",
                "Tip: Before moving, ask yourself: 'What is my opponent threatening?'",
                "Tip: Knights are great in closed positions, bishops shine in open ones.",
                "Tip: Try to place your rooks on open files!",
                "Tip: A knight on the rim is dim - keep them toward the center."
            ],
            endgame: [
                "Tip: In endgames, the king becomes a fighting piece - activate it!",
                "Tip: Passed pawns must be pushed! They're very powerful.",
                "Tip: Rook endgames are the most common - study them!",
                "Tip: Opposition is key in king and pawn endgames."
            ],
            general: [
                "Tip: Always look for checks, captures, and threats before deciding!",
                "Tip: Don't rush! Take your time to see the whole board.",
                "Tip: If you see a good move, look for a better one!",
                "Tip: Learn from your losses - they teach more than wins!",
                "Tip: Try to understand WHY a move is good, not just memorize it.",
                "Tip: Analyze your games afterwards to find mistakes.",
                "Tip: Practice tactics puzzles to improve your pattern recognition!"
            ],
            afterBlunder: [
                "That wasn't the best move - but don't worry, we all make mistakes!",
                "Hmm, you might want to watch out for that. Keep playing though!",
                "Oops! That piece was important. Stay focused, you can recover!",
                "A small slip, but the game isn't over! Keep fighting!"
            ],
            afterGoodDefense: [
                "Nice defense! You protected that well.",
                "Good awareness! You saw the threat coming.",
                "Smart! You didn't fall for that."
            ]
        };

        this.lastTipTime = 0;
        this.moveCount = 0;
        this.lastChatTime = 0;
        this.lastChatCategory = '';
        this.chatCooldown = 4000;
        this.previousGamePhase = 'opening';

        // AI Coach data
        this.coachAnalysis = {
            pieceNames: {
                king: 'King', queen: 'Queen', rook: 'Rook',
                bishop: 'Bishop', knight: 'Knight', pawn: 'Pawn'
            },
            moveTypes: {
                capture: [
                    "They captured your {piece}!",
                    "Your {piece} was taken.",
                    "They traded for your {piece}."
                ],
                check: [
                    "Check! Your king is under attack.",
                    "They put you in check!",
                    "Watch out - check on your king!"
                ],
                castle: [
                    "They castled to safety.",
                    "Opponent castled - their king is now protected.",
                    "Good defensive move - they castled."
                ],
                develop: [
                    "They developed a piece.",
                    "Bringing out their {piece}.",
                    "Standard development move."
                ],
                centerControl: [
                    "They're fighting for the center.",
                    "Central control move.",
                    "They want control of the center squares."
                ],
                threat: [
                    "Warning: They're threatening your {piece}!",
                    "Your {piece} is under attack!",
                    "Watch your {piece} - it's being targeted!"
                ]
            },
            counterTips: {
                capture: [
                    "Look for ways to recapture or create counter-threats.",
                    "Don't panic! See if you can win material back.",
                    "Check if you have a discovered attack or fork available."
                ],
                check: [
                    "Block, capture, or move your king. Consider which option keeps you active.",
                    "Look for a block that also develops a piece.",
                    "Sometimes moving the king to a better square is best."
                ],
                castle: [
                    "Consider castling yourself if you haven't already.",
                    "Their king is safe - shift focus to piece activity.",
                    "Look for weaknesses around their castled king."
                ],
                develop: [
                    "Keep developing your pieces too - activity is key!",
                    "Don't fall behind in development.",
                    "Make sure all your pieces are working together."
                ],
                centerControl: [
                    "Challenge the center with your own pawns or pieces.",
                    "Control the center before attacking on the wings.",
                    "A knight in the center is very powerful."
                ],
                threat: [
                    "Defend it, move it, or create a bigger threat!",
                    "Can you ignore it and threaten something more valuable?",
                    "Always check if you can counter-attack instead of defending."
                ],
                general: [
                    "Take your time and look at all your options.",
                    "Check for any tactics: forks, pins, or skewers.",
                    "Ask yourself: what is their plan?",
                    "Count the attackers and defenders on key squares.",
                    "Look for undefended pieces you can target."
                ]
            },
            openingNames: {
                'e2e4': "King's Pawn Opening",
                'd2d4': "Queen's Pawn Opening",
                'c2c4': "English Opening",
                'g1f3': "Reti Opening",
                'e7e5': "Open Game response",
                'd7d5': "Closed Game response",
                'c7c5': "Sicilian Defense",
                'e7e6': "French Defense",
                'c7c6': "Caro-Kann Defense",
                'g8f6': "Indian Defense"
            }
        };

        this.initBoard();
        this.renderBoard();
        this.setupEventListeners();
        this.initEngine();
        this.resetClocks();
        this.startClock();
    }

    startGameTimer() {
        this.gameStartTime = Date.now();
    }

    recordWin() {
        if (!this.gameStartTime || !this.selectedOpponent) return;
        
        const gameTime = Date.now() - this.gameStartTime;
        const winRecord = {
            opponent: this.selectedOpponent.name,
            opponentElo: this.selectedOpponent.elo,
            opponentAvatar: this.selectedOpponent.avatar,
            timeElapsed: gameTime,
            date: new Date().toISOString(),
            timeControl: this.timeControl
        };

        this.accountSystem.recordWin(winRecord);
        this.accountSystem.showWinNotification(winRecord);
    }

    // Chat methods
    addChatMessage(text, type = '') {
        if (this.gameMode !== 'computer') return;

        const opponent = this.opponents[this.selectedOpponent];
        const messagesContainer = document.getElementById('chat-messages');

        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${type}`;
        messageEl.innerHTML = `
            <span class="avatar">${opponent.avatar}</span>
            <div class="bubble">${text}</div>
        `;

        messagesContainer.appendChild(messageEl);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    getRandomMessage(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    sendGreeting() {
        this.sendGameMessage('greetings');
    }

    sendTip(category = 'general') {
        const opponent = this.opponents[this.selectedOpponent];
        if (opponent.elo < 500) return;

        const now = Date.now();
        if (now - this.lastTipTime < 15000) return;

        const tips = this.chessTips[category] || this.chessTips.general;
        this.addChatMessage(this.getRandomMessage(tips), 'tip');
        this.lastTipTime = now;
    }

    sendGameMessage(type, subtype = null) {
        const tier = this.getPersonalityTier();
        const tierMessages = this.tieredMessages[tier];

        let messages;
        if (subtype) {
            messages = tierMessages[type]?.[subtype];
        } else {
            messages = tierMessages[type];
        }

        if (!messages || messages.length === 0) {
            messages = tierMessages.encouragement;
        }

        this.addChatMessage(this.getRandomMessage(messages));
    }

    handleChatTriggers(playerJustMoved, lastMove, inCheck) {
        const wasCapture = lastMove?.captured;
        const phase = this.getGamePhase();
        const materialBal = this.getMaterialBalance();

        // Check (always fire)
        if (inCheck) {
            if (playerJustMoved) {
                setTimeout(() => this.sendGameMessage('inCheck'), 300);
            } else {
                setTimeout(() => this.sendGameMessage('check'), 300);
            }
            this.recordChat('check');
            return;
        }

        // Promotion (always fire - rare event)
        if (lastMove && this.wasPromotion(lastMove)) {
            setTimeout(() => this.sendGameMessage('promotion'), 300);
            this.recordChat('promotion');
            return;
        }

        // Castling (80% chance)
        if (lastMove && this.wasCastling(lastMove) && Math.random() < 0.8) {
            setTimeout(() => this.sendGameMessage('castling'), 300);
            this.recordChat('castling');
            return;
        }

        // Blunder detection - player blundered
        if (playerJustMoved && this.canSendChat('blunder')) {
            const blunder = this.detectBlunder(lastMove);
            if (blunder) {
                setTimeout(() => this.sendGameMessage('blunder'), 400);
                this.recordChat('blunder');
                return;
            }
        }

        // Blunder detection - bot blundered (admits own mistake)
        if (!playerJustMoved && this.canSendChat('playerBlunder')) {
            const blunder = this.detectBlunder(lastMove);
            if (blunder) {
                setTimeout(() => this.sendGameMessage('playerBlunder'), 400);
                this.recordChat('playerBlunder');
                return;
            }
        }

        // Trade detection
        if (wasCapture && this.detectTrade() && Math.random() < 0.6 && this.canSendChat('tradePieces')) {
            setTimeout(() => this.sendGameMessage('tradePieces'), 300);
            this.recordChat('tradePieces');
            return;
        }

        // Non-trade capture
        if (wasCapture && this.canSendChat('capture')) {
            if (playerJustMoved && Math.random() < 0.55) {
                setTimeout(() => this.sendGameMessage('playerCapture'), 300);
                this.recordChat('capture');
                return;
            } else if (!playerJustMoved && Math.random() < 0.45) {
                setTimeout(() => this.sendGameMessage('opponentCapture'), 300);
                this.recordChat('capture');
                return;
            }
        }

        // Phase transition
        if (phase !== this.previousGamePhase && this.canSendChat('phaseTransition')) {
            this.previousGamePhase = phase;
            setTimeout(() => this.sendGameMessage('phaseTransition'), 500);
            this.recordChat('phaseTransition');
            return;
        }

        // Material imbalance commentary (every ~8 moves when significant)
        if (this.moveCount % 8 === 0 && Math.abs(materialBal) >= 3 && this.canSendChat('material')) {
            if (materialBal > 0) {
                setTimeout(() => this.sendGameMessage('materialUp'), 500);
            } else {
                setTimeout(() => this.sendGameMessage('materialDown'), 500);
            }
            this.recordChat('material');
            return;
        }

        // Opening commentary (first 6 moves, 40% chance)
        if (this.moveCount <= 6 && Math.random() < 0.4 && this.canSendChat('openingComment')) {
            setTimeout(() => this.sendGameMessage('openingComment'), 400);
            this.recordChat('openingComment');
            return;
        }

        // Winning/losing position commentary (every ~10 moves, large advantage)
        if (this.moveCount > 10 && this.moveCount % 10 === 0 && Math.abs(materialBal) >= 5) {
            if (materialBal > 0 && this.canSendChat('winning')) {
                setTimeout(() => this.sendGameMessage('winning'), 500);
                this.recordChat('winning');
                return;
            } else if (materialBal < 0 && this.canSendChat('losing')) {
                setTimeout(() => this.sendGameMessage('losing'), 500);
                this.recordChat('losing');
                return;
            }
        }

        // Good move comment (only non-capture player moves, 15%)
        if (playerJustMoved && !wasCapture && Math.random() < 0.15 && this.canSendChat('playerGoodMove')) {
            setTimeout(() => this.sendGameMessage('playerGoodMove'), 300);
            this.recordChat('playerGoodMove');
            return;
        }

        // Tips (phase-based, for 500+ ELO)
        if (this.moveCount === 4) {
            setTimeout(() => this.sendTip('opening'), 1000);
        } else if (this.moveCount === 14) {
            setTimeout(() => this.sendTip('middlegame'), 1000);
        } else if (this.moveCount === 28) {
            setTimeout(() => this.sendTip('endgame'), 1000);
        } else if (this.moveCount > 5 && this.moveCount % 12 === 0 && Math.random() < 0.4) {
            setTimeout(() => this.sendTip('general'), 1000);
        }

        // Random encouragement (5%, after move 8)
        if (Math.random() < 0.05 && this.moveCount > 8 && this.canSendChat('encouragement')) {
            setTimeout(() => this.sendGameMessage('encouragement'), 800);
            this.recordChat('encouragement');
        }
    }

    clearChat() {
        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.innerHTML = '';
    }

    // Coach methods
    addCoachMessage(text, type = 'move-analysis', icon = '🎯', label = null) {
        if (this.gameMode !== 'computer') return;

        // Auto-assign label based on type if not provided
        if (!label) {
            switch (type) {
                case 'move-analysis':
                    label = "Opponent's Move";
                    break;
                case 'counter-tip':
                    label = 'Suggestion';
                    break;
                case 'warning':
                    label = 'Warning';
                    break;
                case 'danger':
                    label = 'Alert';
                    break;
                default:
                    label = 'Info';
            }
        }

        const messagesContainer = document.getElementById('coach-messages');
        const messageEl = document.createElement('div');
        messageEl.className = `coach-message ${type}`;
        messageEl.innerHTML = `
            <span class="icon">${icon}</span>
            <div class="content">
                <span class="label">${label}</span>
                ${text}
            </div>
        `;

        messagesContainer.appendChild(messageEl);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    clearCoachPanel() {
        const messagesContainer = document.getElementById('coach-messages');
        messagesContainer.innerHTML = '';
    }

    analyzeOpponentMove(move) {
        if (this.gameMode !== 'computer') return;

        const { from, to, piece, captured } = move;
        const analysis = [];

        // Convert to algebraic notation
        const fromSquare = String.fromCharCode(97 + from.col) + (8 - from.row);
        const toSquare = String.fromCharCode(97 + to.col) + (8 - to.row);
        const moveNotation = fromSquare + toSquare;
        const pieceName = this.coachAnalysis.pieceNames[piece.type];

        // Check for opening moves (first few moves)
        if (this.moveCount <= 4) {
            const openingName = this.coachAnalysis.openingNames[moveNotation];
            if (openingName) {
                this.addCoachMessage(
                    `<span class="move-notation">${toSquare}</span> ${openingName}`,
                    'move-analysis', '📖'
                );
                return;
            }
        }

        // Detect castling
        if (piece.type === 'king' && Math.abs(to.col - from.col) === 2) {
            const side = to.col > from.col ? 'kingside' : 'queenside';
            this.addCoachMessage(
                `<span class="move-notation">O-O${side === 'queenside' ? '-O' : ''}</span> ${this.getRandomMessage(this.coachAnalysis.moveTypes.castle)}`,
                'move-analysis', '🏰'
            );
            setTimeout(() => {
                this.addCoachMessage(
                    this.getRandomMessage(this.coachAnalysis.counterTips.castle),
                    'counter-tip', '💡'
                );
            }, 800);
            return;
        }

        // Detect capture
        if (captured) {
            const capturedName = this.coachAnalysis.pieceNames[captured.type];
            const msg = this.getRandomMessage(this.coachAnalysis.moveTypes.capture)
                .replace('{piece}', capturedName);
            this.addCoachMessage(
                `<span class="move-notation">${pieceName[0]}x${toSquare}</span> ${msg}`,
                'danger', '⚔️'
            );
            setTimeout(() => {
                this.addCoachMessage(
                    this.getRandomMessage(this.coachAnalysis.counterTips.capture),
                    'counter-tip', '💡'
                );
            }, 800);
            return;
        }

        // Detect check
        if (this.isInCheck(this.playerColor)) {
            this.addCoachMessage(
                `<span class="move-notation">${pieceName[0]}${toSquare}+</span> ${this.getRandomMessage(this.coachAnalysis.moveTypes.check)}`,
                'danger', '⚠️'
            );
            setTimeout(() => {
                this.addCoachMessage(
                    this.getRandomMessage(this.coachAnalysis.counterTips.check),
                    'counter-tip', '💡'
                );
            }, 800);
            return;
        }

        // Detect threats to player's pieces
        const threats = this.findThreatenedPieces();
        if (threats.length > 0) {
            const threatenedPiece = threats[0];
            const threatName = this.coachAnalysis.pieceNames[threatenedPiece.type];
            const msg = this.getRandomMessage(this.coachAnalysis.moveTypes.threat)
                .replace('{piece}', threatName);
            this.addCoachMessage(
                `<span class="move-notation">${pieceName[0]}${toSquare}</span> ${msg}`,
                'warning', '⚡'
            );
            setTimeout(() => {
                this.addCoachMessage(
                    this.getRandomMessage(this.coachAnalysis.counterTips.threat),
                    'counter-tip', '💡'
                );
            }, 800);
            return;
        }

        // Detect center control
        const centerSquares = [[3,3], [3,4], [4,3], [4,4]];
        const isCenterMove = centerSquares.some(([r, c]) => to.row === r && to.col === c);
        if (isCenterMove) {
            this.addCoachMessage(
                `<span class="move-notation">${pieceName[0]}${toSquare}</span> ${this.getRandomMessage(this.coachAnalysis.moveTypes.centerControl)}`,
                'move-analysis', '🎯'
            );
            setTimeout(() => {
                this.addCoachMessage(
                    this.getRandomMessage(this.coachAnalysis.counterTips.centerControl),
                    'counter-tip', '💡'
                );
            }, 800);
            return;
        }

        // Development move
        if (piece.type !== 'pawn') {
            const msg = this.getRandomMessage(this.coachAnalysis.moveTypes.develop)
                .replace('{piece}', pieceName);
            this.addCoachMessage(
                `<span class="move-notation">${pieceName[0]}${toSquare}</span> ${msg}`,
                'move-analysis', '📍'
            );
            setTimeout(() => {
                this.addCoachMessage(
                    this.getRandomMessage(this.coachAnalysis.counterTips.general),
                    'counter-tip', '💡'
                );
            }, 1000);
            return;
        }

        // Default pawn move
        this.addCoachMessage(
            `<span class="move-notation">${toSquare}</span> Pawn advance.`,
            'move-analysis', '📍'
        );

        // Occasionally give a general tip
        if (Math.random() < 0.4) {
            setTimeout(() => {
                this.addCoachMessage(
                    this.getRandomMessage(this.coachAnalysis.counterTips.general),
                    'counter-tip', '💡'
                );
            }, 1000);
        }
    }

    findThreatenedPieces() {
        const threats = [];
        const opponentColor = this.playerColor === 'white' ? 'black' : 'white';

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.color === this.playerColor && piece.type !== 'king') {
                    // Check if this piece is attacked
                    if (this.isSquareAttacked(row, col, this.playerColor)) {
                        // Check if it's undefended or attacked by lower value piece
                        threats.push({ ...piece, row, col });
                    }
                }
            }
        }

        // Sort by piece value (queen > rook > bishop/knight > pawn)
        const pieceValues = { queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1 };
        threats.sort((a, b) => pieceValues[b.type] - pieceValues[a.type]);

        return threats;
    }

    getPersonalityTier() {
        const elo = this.opponents[this.selectedOpponent].elo;
        if (elo <= 250)  return 'baby';
        if (elo <= 500)  return 'casual';
        if (elo <= 900)  return 'club';
        if (elo <= 1300) return 'skilled';
        if (elo <= 1600) return 'advanced';
        if (elo <= 1800) return 'master';
        return 'engine';
    }

    createCustomOpponent(elo) {
        elo = Math.max(50, Math.min(3000, Math.round(elo)));

        // Interpolate settings from the predefined opponent table
        const presets = [
            { elo: 100,  skill: 0,  depth: 1,  random: 0.85 },
            { elo: 200,  skill: 0,  depth: 1,  random: 0.70 },
            { elo: 300,  skill: 0,  depth: 1,  random: 0.55 },
            { elo: 400,  skill: 0,  depth: 1,  random: 0.40 },
            { elo: 500,  skill: 0,  depth: 1,  random: 0.25 },
            { elo: 600,  skill: 0,  depth: 1,  random: 0.15 },
            { elo: 750,  skill: 0,  depth: 2,  random: 0.05 },
            { elo: 900,  skill: 1,  depth: 3,  random: 0 },
            { elo: 1050, skill: 3,  depth: 4,  random: 0 },
            { elo: 1200, skill: 5,  depth: 6,  random: 0 },
            { elo: 1300, skill: 7,  depth: 8,  random: 0 },
            { elo: 1400, skill: 9,  depth: 10, random: 0 },
            { elo: 1500, skill: 11, depth: 11, random: 0 },
            { elo: 1600, skill: 13, depth: 12, random: 0 },
            { elo: 1700, skill: 15, depth: 13, random: 0 },
            { elo: 1800, skill: 17, depth: 15, random: 0 },
            { elo: 2000, skill: 20, depth: 18, random: 0 },
            { elo: 2200, skill: 20, depth: 22, random: 0 },
        ];

        // Find surrounding presets and interpolate
        let lower = presets[0];
        let upper = presets[presets.length - 1];
        for (let i = 0; i < presets.length - 1; i++) {
            if (elo >= presets[i].elo && elo <= presets[i + 1].elo) {
                lower = presets[i];
                upper = presets[i + 1];
                break;
            }
        }

        const t = upper.elo === lower.elo ? 0 : (elo - lower.elo) / (upper.elo - lower.elo);
        const lerp = (a, b) => a + (b - a) * t;

        const skill = Math.round(lerp(lower.skill, upper.skill));
        const depth = Math.round(lerp(lower.depth, upper.depth));
        const randomMoveChance = Math.max(0, parseFloat(lerp(lower.random, upper.random).toFixed(2)));

        // Pick a title based on ELO range
        let title = 'Custom';
        if (elo < 200) title = 'Absolute Beginner';
        else if (elo < 400) title = 'Beginner';
        else if (elo < 600) title = 'Novice';
        else if (elo < 800) title = 'Casual';
        else if (elo < 1000) title = 'Club Player';
        else if (elo < 1200) title = 'Intermediate';
        else if (elo < 1400) title = 'Advanced';
        else if (elo < 1600) title = 'Expert';
        else if (elo < 1800) title = 'Master';
        else if (elo < 2000) title = 'Grandmaster';
        else title = 'Super GM';

        this.opponents.custom = {
            name: 'Custom Bot',
            avatar: '🎯',
            title: title,
            elo: elo,
            skill: skill,
            depth: depth,
            randomMoveChance: randomMoveChance
        };

        return 'custom';
    }

    selectCustomOpponent(elo) {
        this.createCustomOpponent(elo);

        // Update the custom card in the grid
        const customCard = document.querySelector('[data-opponent="custom"]');
        if (customCard) {
            customCard.querySelector('.opponent-title').textContent = this.opponents.custom.title;
            customCard.querySelector('.opponent-elo').textContent = `${elo} ELO`;
            customCard.querySelector('.opponent-desc').textContent = `Skill ${this.opponents.custom.skill} / Depth ${this.opponents.custom.depth}`;

            document.querySelectorAll('.opponent-card').forEach(c => c.classList.remove('selected'));
            customCard.classList.add('selected');
        }

        this.selectedOpponent = 'custom';
        this.updateChatHeader();
        this.updateNameplateInfo();
    }

    getMaterialBalance() {
        const values = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
        let playerMaterial = 0;
        let opponentMaterial = 0;
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece) {
                    if (piece.color === this.playerColor) {
                        playerMaterial += values[piece.type];
                    } else {
                        opponentMaterial += values[piece.type];
                    }
                }
            }
        }
        return opponentMaterial - playerMaterial;
    }

    getGamePhase() {
        let totalMaterial = 0;
        const values = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece) totalMaterial += values[piece.type];
            }
        }
        if (this.moveCount <= 10) return 'opening';
        if (totalMaterial <= 26) return 'endgame';
        return 'middlegame';
    }

    isSquareDefended(row, col, color) {
        const opponentColor = color === 'white' ? 'black' : 'white';
        const savedPiece = this.board[row][col];
        this.board[row][col] = null;
        const defended = this.isSquareAttacked(row, col, opponentColor);
        this.board[row][col] = savedPiece;
        return defended;
    }

    detectBlunder(lastMove) {
        if (!lastMove) return null;
        const { to, piece } = lastMove;
        const color = piece.color;

        // Check if the piece that just moved is now hanging
        if (this.isSquareAttacked(to.row, to.col, color) &&
            !this.isSquareDefended(to.row, to.col, color)) {
            return { type: 'moved_to_danger', piece: piece.type };
        }

        // Check if a high-value piece was left undefended
        const valuePieces = ['queen', 'rook'];
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const p = this.board[row][col];
                if (p && p.color === color && valuePieces.includes(p.type)) {
                    if (this.isSquareAttacked(row, col, color) &&
                        !this.isSquareDefended(row, col, color)) {
                        return { type: 'left_hanging', piece: p.type };
                    }
                }
            }
        }
        return null;
    }

    detectTrade() {
        const len = this.moveHistory.length;
        if (len < 2) return false;
        const last = this.moveHistory[len - 1];
        const prev = this.moveHistory[len - 2];
        return last.captured && prev.captured &&
               last.to.row === prev.to.row && last.to.col === prev.to.col;
    }

    wasCastling(lastMove) {
        return lastMove && lastMove.piece.type === 'king' &&
               Math.abs(lastMove.to.col - lastMove.from.col) === 2;
    }

    wasPromotion(lastMove) {
        return lastMove && lastMove.piece.type === 'pawn' &&
               (lastMove.to.row === 0 || lastMove.to.row === 7);
    }

    canSendChat(category) {
        const now = Date.now();
        if (now - this.lastChatTime < this.chatCooldown) return false;
        if (category === this.lastChatCategory && now - this.lastChatTime < 8000) return false;
        return true;
    }

    recordChat(category) {
        this.lastChatTime = Date.now();
        this.lastChatCategory = category;
    }

    updateChatHeader() {
        const opponent = this.opponents[this.selectedOpponent];
        document.querySelector('.chat-opponent-avatar').textContent = opponent.avatar;
        document.querySelector('.chat-opponent-name').textContent = opponent.name;
    }

    // Audio methods
    initAudio() {
        // Create audio context on first user interaction
        document.addEventListener('click', () => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
        }, { once: true });
    }

    playSound(type) {
        if (!this.soundEnabled || !this.audioContext) return;

        const ctx = this.audioContext;

        switch (type) {
            case 'move':
                // Realistic wooden piece placement - thump + resonance
                this.playNoise(ctx, 0.04, 0.15, 800, 200);
                this.playTone(ctx, 220, 0.06, 'sine', 0.2);
                this.playTone(ctx, 110, 0.1, 'sine', 0.15, 0.02);
                this.playTone(ctx, 85, 0.12, 'sine', 0.1, 0.03);
                break;

            case 'capture':
                // Louder impact with wood clack
                this.playNoise(ctx, 0.05, 0.2, 1200, 300);
                this.playTone(ctx, 280, 0.04, 'sawtooth', 0.2);
                this.playTone(ctx, 180, 0.08, 'sine', 0.25, 0.02);
                this.playTone(ctx, 120, 0.12, 'sine', 0.2, 0.04);
                this.playTone(ctx, 80, 0.15, 'sine', 0.15, 0.06);
                break;

            case 'check':
                // Sharp alert - two-tone warning
                this.playTone(ctx, 660, 0.08, 'sine', 0.12);
                this.playTone(ctx, 880, 0.08, 'sine', 0.12, 0.09);
                this.playTone(ctx, 660, 0.12, 'sine', 0.1, 0.18);
                break;

            case 'castle':
                // Two distinct placements
                this.playNoise(ctx, 0.03, 0.12, 700, 180);
                this.playTone(ctx, 200, 0.05, 'sine', 0.18);
                this.playTone(ctx, 100, 0.08, 'sine', 0.12, 0.02);
                // Second piece
                this.playNoise(ctx, 0.03, 0.12, 700, 180, 0.18);
                this.playTone(ctx, 190, 0.05, 'sine', 0.16, 0.18);
                this.playTone(ctx, 95, 0.08, 'sine', 0.1, 0.2);
                break;

            case 'gameEnd':
                // Triumphant fanfare
                this.playTone(ctx, 262, 0.2, 'sine', 0.2);
                this.playTone(ctx, 330, 0.2, 'sine', 0.2, 0.15);
                this.playTone(ctx, 392, 0.25, 'sine', 0.22, 0.3);
                this.playTone(ctx, 523, 0.4, 'sine', 0.25, 0.5);
                break;

            case 'illegal':
                // Low buzz
                this.playTone(ctx, 120, 0.12, 'sawtooth', 0.1);
                this.playTone(ctx, 100, 0.1, 'square', 0.08, 0.02);
                break;
        }
    }

    playNoise(ctx, attack, decay, highFreq, lowFreq, delay = 0) {
        // Create filtered noise for wood-like impact
        const bufferSize = ctx.sampleRate * (attack + decay);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(highFreq, ctx.currentTime + delay);
        filter.frequency.exponentialRampToValueAtTime(lowFreq, ctx.currentTime + delay + attack + decay);
        filter.Q.value = 1;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + delay + attack);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + attack + decay);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start(ctx.currentTime + delay);
        noise.stop(ctx.currentTime + delay + attack + decay);
    }

    playTone(ctx, frequency, duration, type = 'sine', volume = 0.3, delay = 0) {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + delay);

        gainNode.gain.setValueAtTime(0, ctx.currentTime + delay);
        gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

        oscillator.start(ctx.currentTime + delay);
        oscillator.stop(ctx.currentTime + delay + duration);
    }

    initEngine() {
        const statusEl = document.getElementById('engine-status');
        statusEl.textContent = 'Loading Stockfish engine...';

        try {
            // Use local Stockfish.js file
            this.engine = new Worker('stockfish.js');

            this.engine.onmessage = (event) => {
                const message = event.data;

                if (message === 'uciok') {
                    this.engineReady = true;
                    statusEl.textContent = 'Engine ready';
                    setTimeout(() => { statusEl.textContent = ''; }, 2000);

                    // Set initial skill level
                    this.setEngineSkill();

                    // If playing as black, let engine make first move
                    if (this.gameMode === 'computer' && this.playerColor === 'black') {
                        this.makeEngineMove();
                    }
                }

                if (message.startsWith('bestmove')) {
                    const move = message.split(' ')[1];
                    if (move && move !== '(none)') {
                        this.applyEngineMove(move);
                    }
                    this.isThinking = false;
                    document.getElementById('board').classList.remove('thinking');
                    this.updateNameplates();
                    statusEl.textContent = '';
                }
            };

            this.engine.onerror = (error) => {
                console.error('Engine error:', error);
                statusEl.textContent = 'Engine error - try using a local server';
            };

            // Initialize UCI protocol
            this.engine.postMessage('uci');
        } catch (error) {
            console.error('Failed to initialize engine:', error);
            statusEl.textContent = 'Engine not available';
        }
    }

    setEngineSkill() {
        if (!this.engine || !this.engineReady) return;

        const opponent = this.opponents[this.selectedOpponent];
        this.engine.postMessage(`setoption name Skill Level value ${opponent.skill}`);
    }

    getRandomLegalMoveUCI() {
        const color = this.currentPlayer;
        const moves = [];
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.color === color) {
                    const validMoves = this.getValidMoves(row, col);
                    for (const move of validMoves) {
                        const fromFile = String.fromCharCode(97 + col);
                        const fromRank = 8 - row;
                        const toFile = String.fromCharCode(97 + move.col);
                        const toRank = 8 - move.row;
                        let uci = `${fromFile}${fromRank}${toFile}${toRank}`;
                        // Add promotion (default to queen for random moves)
                        if (piece.type === 'pawn' && (move.row === 0 || move.row === 7)) {
                            uci += 'q';
                        }
                        moves.push(uci);
                    }
                }
            }
        }
        if (moves.length === 0) return null;
        return moves[Math.floor(Math.random() * moves.length)];
    }

    initBoard() {
        this.gameStartTime = Date.now();
        const backRow = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

        this.board = [];
        for (let row = 0; row < 8; row++) {
            this.board[row] = [];
            for (let col = 0; col < 8; col++) {
                if (row === 0) {
                    this.board[row][col] = { type: backRow[col], color: 'black' };
                } else if (row === 1) {
                    this.board[row][col] = { type: 'pawn', color: 'black' };
                } else if (row === 6) {
                    this.board[row][col] = { type: 'pawn', color: 'white' };
                } else if (row === 7) {
                    this.board[row][col] = { type: backRow[col], color: 'white' };
                } else {
                    this.board[row][col] = null;
                }
            }
        }

        this.currentPlayer = 'white';
        this.selectedSquare = null;
        this.validMoves = [];
        this.lastMove = null;
        this.enPassantTarget = null;
        this.castlingRights = {
            white: { kingSide: true, queenSide: true },
            black: { kingSide: true, queenSide: true }
        };
        this.capturedPieces = { white: [], black: [] };
        this.isGameOver = false;
        this.moveHistory = [];
        this.notationHistory = [];
        this.halfMoveClock = 0;
        this.fullMoveNumber = 1;
        this.isThinking = false;
        this.isAnimating = false;
        this.kingPos = { white: { row: 7, col: 4 }, black: { row: 0, col: 4 } };
        this._lastCapturedCount = 0;
        this.positionCounts = new Map();
    }

    initBoardDOM() {
        const boardEl = document.getElementById('board');
        boardEl.innerHTML = '';
        this.squareElements = [];

        const flipped = (this.gameMode === 'computer' || this.gameMode === 'online') && this.playerColor === 'black';

        for (let displayRow = 0; displayRow < 8; displayRow++) {
            for (let displayCol = 0; displayCol < 8; displayCol++) {
                const row = flipped ? 7 - displayRow : displayRow;
                const col = flipped ? 7 - displayCol : displayCol;

                const square = document.createElement('div');
                square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
                square.dataset.row = row;
                square.dataset.col = col;
                boardEl.appendChild(square);

                if (!this.squareElements[row]) this.squareElements[row] = [];
                this.squareElements[row][col] = square;
            }
        }

        this.renderCoordinates();
        this.updateBoard();
    }

    renderBoard() {
        // Full re-init when board orientation changes (new game)
        this.initBoardDOM();
    }

    updateBoard(inCheckOverride) {
        const kingPos = this.findKing(this.currentPlayer);
        const inCheck = inCheckOverride !== undefined ? inCheckOverride : (kingPos ? this.isInCheck(this.currentPlayer) : false);

        // Build a Set for quick valid move lookup
        const validMoveSet = new Set();
        for (const m of this.validMoves) {
            validMoveSet.add(m.row * 8 + m.col);
        }

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = this.squareElements[row]?.[col];
                if (!square) continue;

                const piece = this.board[row][col];

                // Update piece content only if changed
                const currentPieceKey = piece ? `${piece.color}-${piece.type}` : '';
                if (square.dataset.pieceKey !== currentPieceKey) {
                    const existingPiece = square.querySelector('.piece');
                    if (existingPiece) existingPiece.remove();

                    if (piece) {
                        if (this.useImagePieces) {
                            const pieceEl = document.createElement('img');
                            pieceEl.className = `piece ${piece.color}`;
                            pieceEl.src = this.pieceImages[piece.color][piece.type];
                            pieceEl.alt = `${piece.color} ${piece.type}`;
                            pieceEl.draggable = false;
                            square.appendChild(pieceEl);
                        } else {
                            const pieceEl = document.createElement('span');
                            pieceEl.className = `piece ${piece.color}`;
                            pieceEl.textContent = this.pieces[piece.color][piece.type];
                            square.appendChild(pieceEl);
                        }
                    }
                    square.dataset.pieceKey = currentPieceKey;
                }

                // Update highlight classes
                const isSelected = this.selectedSquare && this.selectedSquare.row === row && this.selectedSquare.col === col;
                const isValidMove = validMoveSet.has(row * 8 + col);
                const isValidCapture = isValidMove && (piece ||
                    (this.enPassantTarget && row === this.enPassantTarget.row && col === this.enPassantTarget.col));
                const isLastMove = this.lastMove &&
                    ((row === this.lastMove.from.row && col === this.lastMove.from.col) ||
                     (row === this.lastMove.to.row && col === this.lastMove.to.col));
                const isCheck = kingPos && row === kingPos.row && col === kingPos.col && inCheck;

                square.classList.toggle('selected', !!isSelected);
                square.classList.toggle('valid-move', isValidMove && !isValidCapture);
                square.classList.toggle('valid-capture', !!isValidCapture);
                square.classList.toggle('last-move', !!isLastMove);
                square.classList.toggle('check', !!isCheck);
            }
        }

        this.updateGameInfo();

        // Only rebuild captured pieces when capture count changed
        const currentCapturedCount = this.capturedPieces.white.length + this.capturedPieces.black.length;
        if (currentCapturedCount !== this._lastCapturedCount) {
            this._lastCapturedCount = currentCapturedCount;
            this.updateCapturedPieces();
        }
    }

    renderCoordinates() {
        const flipped = (this.gameMode === 'computer' || this.gameMode === 'online') && this.playerColor === 'black';

        // Render rank labels (1-8)
        const rankLabels = document.getElementById('rank-labels');
        rankLabels.innerHTML = '';
        for (let i = 0; i < 8; i++) {
            const rank = flipped ? (i + 1) : (8 - i);
            const label = document.createElement('div');
            label.className = 'rank-label';
            label.textContent = rank;
            rankLabels.appendChild(label);
        }

        // Render file labels (a-h)
        const fileLabels = document.getElementById('file-labels');
        fileLabels.innerHTML = '';
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        for (let i = 0; i < 8; i++) {
            const file = flipped ? files[7 - i] : files[i];
            const label = document.createElement('div');
            label.className = 'file-label';
            label.textContent = file;
            fileLabels.appendChild(label);
        }
    }

    setupEventListeners() {
        // Board click handler
        document.getElementById('board').addEventListener('click', (e) => {
            if (this.isGameOver || this.isThinking || this.isAnimating) return;

            // In computer/online mode, only allow moves for player's color
            if ((this.gameMode === 'computer' || this.gameMode === 'online') && this.currentPlayer !== this.playerColor) {
                return;
            }

            const square = e.target.closest('.square');
            if (!square) return;

            const row = parseInt(square.dataset.row);
            const col = parseInt(square.dataset.col);

            this.handleSquareClick(row, col);
        });

        // Opponent card selection
        const customEloSection = document.getElementById('custom-elo-section');
        document.querySelectorAll('.opponent-card').forEach(card => {
            card.addEventListener('click', () => {
                const opponentKey = card.dataset.opponent;

                if (opponentKey === 'random') {
                    customEloSection?.classList.add('hidden');
                    card.classList.add('rolling');

                    const opponentKeys = Object.keys(this.opponents).filter(k => k !== 'custom');
                    const randomIndex = Math.floor(Math.random() * opponentKeys.length);
                    const randomOpponent = opponentKeys[randomIndex];

                    setTimeout(() => {
                        card.classList.remove('rolling');
                        document.querySelectorAll('.opponent-card').forEach(c => c.classList.remove('selected'));

                        const randomCard = document.querySelector(`[data-opponent="${randomOpponent}"]`);
                        if (randomCard) {
                            randomCard.classList.add('selected');
                            randomCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }

                        this.selectedOpponent = randomOpponent;
                        this.updateChatHeader();
                        this.updateNameplateInfo();
                    }, 500);
                } else if (opponentKey === 'custom') {
                    document.querySelectorAll('.opponent-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    customEloSection?.classList.remove('hidden');
                    document.getElementById('custom-elo-input')?.focus();
                    // If custom opponent already configured, select it
                    if (this.opponents.custom) {
                        this.selectedOpponent = 'custom';
                        this.updateChatHeader();
                        this.updateNameplateInfo();
                    }
                } else {
                    customEloSection?.classList.add('hidden');
                    document.querySelectorAll('.opponent-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    this.selectedOpponent = opponentKey;
                    this.updateChatHeader();
                    this.updateNameplateInfo();
                }
            });
        });

        // Custom ELO input
        const customEloBtn = document.getElementById('custom-elo-btn');
        const customEloInput = document.getElementById('custom-elo-input');
        if (customEloBtn && customEloInput) {
            const applyCustomElo = () => {
                const elo = parseInt(customEloInput.value);
                if (isNaN(elo) || elo < 50 || elo > 3000) return;
                this.selectCustomOpponent(elo);
            };
            customEloBtn.addEventListener('click', applyCustomElo);
            customEloInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') applyCustomElo();
            });
        }

        // Select default opponent
        document.querySelector(`[data-opponent="${this.selectedOpponent}"]`)?.classList.add('selected');

        // Lobby modal handlers
        document.getElementById('lobby-close').addEventListener('click', () => {
            document.getElementById('lobby-modal').classList.add('hidden');
            if (this.channel && !this.opponentJoined) {
                this.cleanupOnlineGame();
            }
        });

        document.getElementById('lobby-modal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                document.getElementById('lobby-modal').classList.add('hidden');
                if (this.channel && !this.opponentJoined) {
                    this.cleanupOnlineGame();
                }
            }
        });

        document.querySelectorAll('.lobby-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.lobby-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const isCreate = tab.dataset.tab === 'create';
                document.getElementById('lobby-create').classList.toggle('hidden', !isCreate);
                document.getElementById('lobby-join').classList.toggle('hidden', isCreate);
            });
        });

        document.getElementById('lobby-create-btn').addEventListener('click', () => {
            this.createLobby();
        });

        document.getElementById('lobby-join-btn').addEventListener('click', () => {
            const code = document.getElementById('lobby-code-input').value.trim();
            if (code.length !== 6) {
                document.getElementById('lobby-error').textContent = 'Code must be 6 characters.';
                return;
            }
            this.joinLobby(code);
        });

        document.getElementById('lobby-code-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('lobby-join-btn').click();
            }
        });

        document.getElementById('lobby-copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(this.lobbyCode).then(() => {
                const btn = document.getElementById('lobby-copy-btn');
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = 'Copy Code'; }, 2000);
            });
        });

        // New game button
        document.getElementById('new-game').addEventListener('click', () => {
            const modeVal = document.getElementById('game-mode').value;

            // Clean up any existing online game
            this.cleanupOnlineGame();

            this.gameMode = modeVal;

            // If online mode selected, show lobby modal instead of starting game
            if (this.gameMode === 'online') {
                this.showLobbyModal();
                return;
            }

            this.playerColor = document.getElementById('player-color').value;

            this.initBoard();
            this.renderBoard();
            document.getElementById('game-status').textContent = '';
            document.getElementById('engine-status').textContent = '';

            // Update opponent display
            this.updateOpponentDisplay();
            this.updateNameplateInfo();
            this.updateNameplates();

            // Reset and start chess clock
            this.resetClocks();
            this.startClock();

            // Update chat panel and move history
            this.clearChat();
            this.clearMoveHistory();
            this.updateChatHeader();
            this.moveCount = 0;
            this.lastTipTime = 0;
            this.lastChatTime = 0;
            this.lastChatCategory = '';
            this.previousGamePhase = 'opening';

            const chatPanel = document.getElementById('chat-panel');
            const coachPanel = document.getElementById('coach-panel');
            if (this.gameMode === 'computer') {
                chatPanel.classList.remove('hidden');
                coachPanel.classList.remove('hidden');
                this.clearCoachPanel();
                setTimeout(() => this.sendGreeting(), 500);
                // Add initial coach message
                setTimeout(() => {
                    this.addCoachMessage("I'll analyze your opponent's moves and suggest counter-play.", 'move-analysis', '🎯', 'Welcome');
                }, 600);
            } else {
                chatPanel.classList.add('hidden');
                coachPanel.classList.add('hidden');
            }

            // Reset engine
            if (this.engine && this.engineReady) {
                this.engine.postMessage('ucinewgame');
                this.setEngineSkill();

                // If playing as black, let engine move first
                if (this.gameMode === 'computer' && this.playerColor === 'black') {
                    setTimeout(() => this.makeEngineMove(), 200);
                }
            }
        });

        // Game mode change handler
        document.getElementById('game-mode').addEventListener('change', (e) => {
            const isComputer = e.target.value === 'computer';
            document.getElementById('opponent-select').classList.toggle('hidden', !isComputer);
            document.getElementById('color-group').style.display = isComputer ? 'flex' : 'none';
            document.getElementById('chat-panel').classList.toggle('hidden', !isComputer);
            document.getElementById('coach-panel').classList.toggle('hidden', !isComputer);
            // Hide color group for online mode too (host is always white)
            if (e.target.value === 'online') {
                document.getElementById('color-group').style.display = 'none';
                this.cleanupOnlineGame();
                this.gameMode = 'online';
                this.showLobbyModal();
            } else if (e.target.value === 'human') {
                this.cleanupOnlineGame();
                document.getElementById('new-game').click();
            }
        });

        // Time control change handler
        document.getElementById('time-control').addEventListener('change', (e) => {
            this.timeControl = e.target.value;
            this.initialTime = this.timeControls[this.timeControl].initial;
            this.increment = this.timeControls[this.timeControl].increment;
        });

        // Piece style change handler
        document.getElementById('piece-style').addEventListener('change', (e) => {
            const style = e.target.value;
            const base = `https://lichess1.org/assets/piece/${style}/`;
            this.pieceImages = {
                white: {
                    king: base + 'wK.svg', queen: base + 'wQ.svg', rook: base + 'wR.svg',
                    bishop: base + 'wB.svg', knight: base + 'wN.svg', pawn: base + 'wP.svg'
                },
                black: {
                    king: base + 'bK.svg', queen: base + 'bQ.svg', rook: base + 'bR.svg',
                    bishop: base + 'bB.svg', knight: base + 'bN.svg', pawn: base + 'bP.svg'
                }
            };
            localStorage.setItem('chess_piece_style', style);
            // Clear piece keys to force re-render with new images
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    const square = this.squareElements[row]?.[col];
                    if (square) square.dataset.pieceKey = '';
                }
            }
            this.updateBoard();
        });

        // Load saved piece style
        const savedStyle = localStorage.getItem('chess_piece_style');
        if (savedStyle) {
            document.getElementById('piece-style').value = savedStyle;
            const base = `https://lichess1.org/assets/piece/${savedStyle}/`;
            this.pieceImages = {
                white: {
                    king: base + 'wK.svg', queen: base + 'wQ.svg', rook: base + 'wR.svg',
                    bishop: base + 'wB.svg', knight: base + 'wN.svg', pawn: base + 'wP.svg'
                },
                black: {
                    king: base + 'bK.svg', queen: base + 'bQ.svg', rook: base + 'bR.svg',
                    bishop: base + 'bB.svg', knight: base + 'bN.svg', pawn: base + 'bP.svg'
                }
            };
        }

        // Resign button
        document.getElementById('resign-btn').addEventListener('click', () => {
            if (this.isGameOver) return;
            this.resign();
        });

        // Draw offer button
        document.getElementById('draw-btn').addEventListener('click', () => {
            if (this.isGameOver) return;
            this.offerDraw();
        });

        // Initialize chat and coach panels
        this.updateChatHeader();
        this.updateNameplateInfo();
        this.updateNameplates();
        this.updateClockDisplay();
        this.updateGameButtons();
        if (this.gameMode === 'computer') {
            document.getElementById('chat-panel').classList.remove('hidden');
            document.getElementById('coach-panel').classList.remove('hidden');
        }
    }

    resign() {
        this.isGameOver = true;
        this.stopClock();
        this.playSound('gameEnd');

        const winner = this.playerColor === 'white' ? 'Black' : 'White';
        document.getElementById('game-status').textContent = `You resigned. ${winner} wins!`;

        if (this.gameMode === 'computer') {
            setTimeout(() => {
                this.sendGameMessage('resign');
            }, 500);
        }

        if (this.gameMode === 'online' && this.channel) {
            this.channel.send({
                type: 'broadcast',
                event: 'resign',
                payload: {}
            });
        }

        this.updateGameButtons();
    }

    offerDraw() {
        if (this.gameMode === 'online' && this.channel) {
            this.channel.send({
                type: 'broadcast',
                event: 'offer-draw',
                payload: {}
            });
            document.getElementById('game-status').textContent = 'Draw offer sent...';
            return;
        }

        if (this.gameMode === 'computer') {
            // AI decides whether to accept based on position and ELO
            const acceptChance = this.calculateDrawAcceptChance();

            if (Math.random() < acceptChance) {
                // Accept draw
                this.isGameOver = true;
                this.stopClock();
                this.playSound('gameEnd');
                document.getElementById('game-status').textContent = 'Draw agreed!';
                this.sendGameMessage('gameEnd', 'draw');
            } else {
                // Decline draw
                const tier = this.getPersonalityTier();
                const messages = this.tieredMessages[tier].drawOffer;
                this.addChatMessage(this.getRandomMessage(messages), 'taunt');
            }
        } else {
            // In human mode, just toggle draw offer state
            this.drawOffered = !this.drawOffered;
            document.getElementById('game-status').textContent = this.drawOffered ?
                'Draw offered - opponent can accept by clicking Offer Draw' : '';
        }

        this.updateGameButtons();
    }

    calculateDrawAcceptChance() {
        const opponent = this.opponents[this.selectedOpponent];
        let chance = 0.3; // Base 30% chance

        // Lower ELO opponents more likely to accept
        if (opponent.elo < 500) chance += 0.3;
        else if (opponent.elo < 1000) chance += 0.15;
        else if (opponent.elo > 1500) chance -= 0.15;

        // More likely to accept in longer games
        if (this.moveCount > 40) chance += 0.2;
        else if (this.moveCount > 60) chance += 0.3;

        // More likely if low on time
        if (this.opponentTime < 60) chance += 0.25;

        return Math.max(0.1, Math.min(0.8, chance));
    }

    updateGameButtons() {
        const resignBtn = document.getElementById('resign-btn');
        const drawBtn = document.getElementById('draw-btn');

        if (resignBtn) resignBtn.disabled = this.isGameOver;
        if (drawBtn) drawBtn.disabled = this.isGameOver;
    }

    updateOpponentDisplay() {
        const display = document.getElementById('opponent-display');

        if (this.gameMode === 'computer') {
            const opponent = this.opponents[this.selectedOpponent];
            display.innerHTML = `
                <span class="avatar">${opponent.avatar}</span>
                <div class="info">
                    <div class="name">${opponent.name}</div>
                    <div class="elo">${opponent.title} - ${opponent.elo} ELO</div>
                </div>
            `;
            display.classList.remove('hidden');
        } else {
            display.classList.add('hidden');
        }
    }

    handleSquareClick(row, col) {
        const clickedPiece = this.board[row][col];

        if (this.selectedSquare) {
            const isValidMove = this.validMoves.some(m => m.row === row && m.col === col);

            if (isValidMove) {
                const fromRow = this.selectedSquare.row;
                const fromCol = this.selectedSquare.col;
                this.selectedSquare = null;
                this.validMoves = [];
                this.animateMove(fromRow, fromCol, row, col);
            } else if (clickedPiece && clickedPiece.color === this.currentPlayer) {
                this.selectedSquare = { row, col };
                this.validMoves = this.getValidMoves(row, col);
                this.updateBoard();
            } else {
                this.selectedSquare = null;
                this.validMoves = [];
                this.updateBoard();
            }
        } else {
            if (clickedPiece && clickedPiece.color === this.currentPlayer) {
                this.selectedSquare = { row, col };
                this.validMoves = this.getValidMoves(row, col);
            }
            this.updateBoard();
        }
    }

    animateMove(fromRow, fromCol, toRow, toCol, promotionPiece = null, callback = null) {
        this.isAnimating = true;
        const boardEl = document.getElementById('board');
        const flipped = (this.gameMode === 'computer' || this.gameMode === 'online') && this.playerColor === 'black';

        // Calculate display positions
        const fromDisplayRow = flipped ? 7 - fromRow : fromRow;
        const fromDisplayCol = flipped ? 7 - fromCol : fromCol;
        const toDisplayRow = flipped ? 7 - toRow : toRow;
        const toDisplayCol = flipped ? 7 - toCol : toCol;

        // Find the source square and piece
        const fromSquare = boardEl.querySelector(`[data-row="${fromRow}"][data-col="${fromCol}"]`);
        const toSquare = boardEl.querySelector(`[data-row="${toRow}"][data-col="${toCol}"]`);
        const pieceEl = fromSquare?.querySelector('.piece');

        if (!pieceEl || !fromSquare || !toSquare) {
            // Fallback: just make the move without animation
            this.makeMove(fromRow, fromCol, toRow, toCol, promotionPiece);
            this.isAnimating = false;
            if (callback) callback();
            return;
        }

        // Calculate the movement delta in pixels
        const squareSize = 60;
        const deltaX = (toDisplayCol - fromDisplayCol) * squareSize;
        const deltaY = (toDisplayRow - fromDisplayRow) * squareSize;

        // Check if this is a capture move (including en passant)
        let capturedPieceEl = toSquare.querySelector('.piece');
        let captureSquare = toSquare;
        const movingPiece = this.board[fromRow][fromCol];
        if (!capturedPieceEl && movingPiece && movingPiece.type === 'pawn' &&
            this.enPassantTarget && toRow === this.enPassantTarget.row && toCol === this.enPassantTarget.col) {
            const epRow = this.currentPlayer === 'white' ? toRow + 1 : toRow - 1;
            const epSquare = boardEl.querySelector(`[data-row="${epRow}"][data-col="${toCol}"]`);
            capturedPieceEl = epSquare?.querySelector('.piece');
            if (epSquare) captureSquare = epSquare;
        }
        const isCapture = !!capturedPieceEl;

        // Clone the piece for animation
        const animatingPiece = pieceEl.cloneNode(true);
        animatingPiece.classList.add('animating');

        // Position the animating piece at the start
        const fromRect = fromSquare.getBoundingClientRect();
        const boardRect = boardEl.getBoundingClientRect();
        animatingPiece.style.left = (fromRect.left - boardRect.left) + 'px';
        animatingPiece.style.top = (fromRect.top - boardRect.top) + 'px';
        animatingPiece.style.width = squareSize + 'px';
        animatingPiece.style.height = squareSize + 'px';
        animatingPiece.style.display = 'flex';
        animatingPiece.style.justifyContent = 'center';
        animatingPiece.style.alignItems = 'center';

        // Hide the original piece
        pieceEl.style.visibility = 'hidden';

        // Add to board
        boardEl.style.position = 'relative';
        boardEl.appendChild(animatingPiece);

        // Trigger animation
        requestAnimationFrame(() => {
            animatingPiece.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        });

        // After slide completes, handle capture effects or finish
        setTimeout(() => {
            if (isCapture && capturedPieceEl) {
                // Determine captured piece type for special animations
                const capturedPieceData = this.board[toRow]?.[toCol] ||
                    (captureSquare !== toSquare ? this.board[parseInt(captureSquare.dataset.row)]?.[parseInt(captureSquare.dataset.col)] : null);
                const capturedType = capturedPieceData?.type || '';

                // Apply type-specific captured piece animation
                if (capturedType === 'queen') {
                    capturedPieceEl.classList.add('captured-queen');
                } else if (capturedType === 'rook') {
                    capturedPieceEl.classList.add('captured-rook');
                } else {
                    capturedPieceEl.classList.add('captured-anim');
                }

                // Type-specific impact ring
                const impactClass = capturedType === 'queen' ? 'capture-impact-queen'
                    : capturedType === 'rook' ? 'capture-impact-rook'
                    : 'capture-impact';
                captureSquare.classList.add(impactClass);
                const impactDuration = capturedType === 'queen' ? 700 : 500;
                setTimeout(() => captureSquare.classList.remove(impactClass), impactDuration);

                // Spawn type-specific spark particles
                this.spawnCaptureSparks(captureSquare, capturedType);

                // Wait for capture effects before finishing
                const effectDuration = capturedType === 'queen' ? 350 : 200;
                setTimeout(() => {
                    animatingPiece.remove();
                    this.isAnimating = false;
                    this.makeMove(fromRow, fromCol, toRow, toCol, promotionPiece);
                    if (callback) callback();
                }, effectDuration);
            } else {
                animatingPiece.remove();
                this.isAnimating = false;
                this.makeMove(fromRow, fromCol, toRow, toCol, promotionPiece);
                if (callback) callback();
            }
        }, 250);
    }

    spawnCaptureSparks(square, capturedType) {
        const rect = square.getBoundingClientRect();
        const boardEl = document.getElementById('board');
        const boardRect = boardEl.getBoundingClientRect();
        const cx = rect.left - boardRect.left + rect.width / 2;
        const cy = rect.top - boardRect.top + rect.height / 2;

        if (capturedType === 'queen') {
            // Queen: lots of glowing purple/gold sparks in a starburst
            const sparkCount = 14;
            for (let i = 0; i < sparkCount; i++) {
                const spark = document.createElement('div');
                spark.className = 'capture-spark-queen';
                const angle = (i / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
                const distance = 25 + Math.random() * 35;
                const dx = Math.cos(angle) * distance;
                const dy = Math.sin(angle) * distance;
                spark.style.left = cx + 'px';
                spark.style.top = cy + 'px';
                spark.style.setProperty('--spark-end', `translate(${dx}px, ${dy}px)`);
                const size = 5 + Math.random() * 6;
                spark.style.width = size + 'px';
                spark.style.height = size + 'px';
                spark.style.animationDuration = (0.35 + Math.random() * 0.3) + 's';
                boardEl.appendChild(spark);
                setTimeout(() => spark.remove(), 700);
            }
        } else if (capturedType === 'rook') {
            // Rook: rectangular debris chunks that tumble outward and fall
            const sparkCount = 10;
            for (let i = 0; i < sparkCount; i++) {
                const spark = document.createElement('div');
                spark.className = 'capture-spark-rook';
                const angle = (i / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
                const distance = 15 + Math.random() * 30;
                const dx = Math.cos(angle) * distance;
                const dy = Math.sin(angle) * distance + 10; // bias downward for gravity feel
                spark.style.left = cx + 'px';
                spark.style.top = cy + 'px';
                spark.style.setProperty('--spark-end', `translate(${dx}px, ${dy}px)`);
                spark.style.setProperty('--debris-rot', `${90 + Math.random() * 270}deg`);
                const w = 4 + Math.random() * 5;
                const h = 3 + Math.random() * 4;
                spark.style.width = w + 'px';
                spark.style.height = h + 'px';
                spark.style.animationDuration = (0.3 + Math.random() * 0.3) + 's';
                boardEl.appendChild(spark);
                setTimeout(() => spark.remove(), 700);
            }
        } else {
            // Default: golden round sparks
            const sparkCount = 8;
            for (let i = 0; i < sparkCount; i++) {
                const spark = document.createElement('div');
                spark.className = 'capture-spark';
                const angle = (i / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
                const distance = 20 + Math.random() * 25;
                const dx = Math.cos(angle) * distance;
                const dy = Math.sin(angle) * distance;
                spark.style.left = cx + 'px';
                spark.style.top = cy + 'px';
                spark.style.setProperty('--spark-end', `translate(${dx}px, ${dy}px)`);
                spark.style.width = (4 + Math.random() * 4) + 'px';
                spark.style.height = spark.style.width;
                spark.style.animationDuration = (0.3 + Math.random() * 0.25) + 's';
                boardEl.appendChild(spark);
                setTimeout(() => spark.remove(), 600);
            }
        }
    }

    makeMove(fromRow, fromCol, toRow, toCol, promotionPiece = null) {
        const piece = this.board[fromRow][fromCol];
        const capturedPiece = this.board[toRow][toCol];

        // Store move in history (for FEN generation)
        this.moveHistory.push({
            from: { row: fromRow, col: fromCol },
            to: { row: toRow, col: toCol },
            piece: piece,
            captured: capturedPiece
        });

        if (capturedPiece) {
            this.capturedPieces[this.currentPlayer].push(capturedPiece);
            this.halfMoveClock = 0;
        } else if (piece.type === 'pawn') {
            this.halfMoveClock = 0;
        } else {
            this.halfMoveClock++;
        }

        // En passant capture
        if (piece.type === 'pawn' && this.enPassantTarget &&
            toRow === this.enPassantTarget.row && toCol === this.enPassantTarget.col) {
            const capturedPawnRow = this.currentPlayer === 'white' ? toRow + 1 : toRow - 1;
            const capturedPawn = this.board[capturedPawnRow][toCol];
            this.capturedPieces[this.currentPlayer].push(capturedPawn);
            this.board[capturedPawnRow][toCol] = null;
        }

        // Castling
        let isCastling = false;
        if (piece.type === 'king' && Math.abs(toCol - fromCol) === 2) {
            isCastling = true;
            if (toCol > fromCol) {
                // King-side castling
                this.board[fromRow][5] = this.board[fromRow][7];
                this.board[fromRow][7] = null;
            } else {
                // Queen-side castling
                this.board[fromRow][3] = this.board[fromRow][0];
                this.board[fromRow][0] = null;
            }
        }

        // Play sound effects
        if (capturedPiece || (piece.type === 'pawn' && this.enPassantTarget &&
            toRow === this.enPassantTarget.row && toCol === this.enPassantTarget.col)) {
            this.playSound('capture');
        } else if (isCastling) {
            this.playSound('castle');
        } else {
            this.playSound('move');
        }

        // Update castling rights
        if (piece.type === 'king') {
            this.castlingRights[piece.color].kingSide = false;
            this.castlingRights[piece.color].queenSide = false;
        }
        if (piece.type === 'rook') {
            if (fromCol === 0) {
                this.castlingRights[piece.color].queenSide = false;
            } else if (fromCol === 7) {
                this.castlingRights[piece.color].kingSide = false;
            }
        }
        // Also update if rook is captured
        if (capturedPiece && capturedPiece.type === 'rook') {
            const capturedColor = capturedPiece.color;
            if (toCol === 0) {
                this.castlingRights[capturedColor].queenSide = false;
            } else if (toCol === 7) {
                this.castlingRights[capturedColor].kingSide = false;
            }
        }

        // Update en passant target
        if (piece.type === 'pawn' && Math.abs(toRow - fromRow) === 2) {
            this.enPassantTarget = {
                row: (fromRow + toRow) / 2,
                col: fromCol
            };
        } else {
            this.enPassantTarget = null;
        }

        // Move the piece
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;

        // Update cached king position
        if (piece.type === 'king') {
            this.kingPos[piece.color] = { row: toRow, col: toCol };
        }

        // Pawn promotion
        if (piece.type === 'pawn' && (toRow === 0 || toRow === 7)) {
            if (promotionPiece) {
                this.board[toRow][toCol] = { type: promotionPiece, color: piece.color };
                this.lastMove = { from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } };
                this.finishTurn();
            } else {
                this.showPromotionModal(toRow, toCol, piece.color);
            }
            return;
        }

        this.lastMove = { from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } };
        this.finishTurn();
    }

    showPromotionModal(row, col, color) {
        const modal = document.getElementById('promotion-modal');
        const choices = modal.querySelector('.promotion-choices');
        choices.innerHTML = '';

        const promotionPieces = ['queen', 'rook', 'bishop', 'knight'];
        promotionPieces.forEach(pieceType => {
            const option = document.createElement('div');
            option.className = 'piece-option';

            if (this.useImagePieces) {
                const img = document.createElement('img');
                img.src = this.pieceImages[color][pieceType];
                img.alt = pieceType;
                img.draggable = false;
                option.appendChild(img);
            } else {
                option.textContent = this.pieces[color][pieceType];
            }

            option.addEventListener('click', () => {
                this.board[row][col] = { type: pieceType, color: color };
                modal.classList.add('hidden');
                this.finishTurn();
            });
            choices.appendChild(option);
        });

        modal.classList.remove('hidden');
    }

    finishTurn() {
        if (this.currentPlayer === 'black') {
            this.fullMoveNumber++;
        }

        // Add time increment after completing a move
        const previousPlayer = this.currentPlayer;
        if (previousPlayer === this.playerColor) {
            this.playerTime += this.increment;
        } else {
            this.opponentTime += this.increment;
        }
        this.updateClockDisplay();

        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        this.moveCount++;

        // Online multiplayer: broadcast move to opponent
        if (this.gameMode === 'online' && !this.isRemoteMove) {
            const lastMoveData = this.moveHistory[this.moveHistory.length - 1];
            if (lastMoveData) {
                const movedPiece = this.board[lastMoveData.to.row][lastMoveData.to.col];
                const promotionPiece = (lastMoveData.piece.type === 'pawn' &&
                    (lastMoveData.to.row === 0 || lastMoveData.to.row === 7))
                    ? movedPiece.type : null;
                this.sendMove(
                    lastMoveData.from.row, lastMoveData.from.col,
                    lastMoveData.to.row, lastMoveData.to.col,
                    promotionPiece
                );
            }
        }
        this.isRemoteMove = false;

        // Track position for threefold repetition using Map for O(1) lookup
        const positionKey = this.getPositionKey();
        this.positionHistory.push(positionKey);
        this.positionCounts.set(positionKey, (this.positionCounts.get(positionKey) || 0) + 1);

        // Check for draws (pass positionKey to avoid recomputing)
        const drawResult = this.checkForDraw(positionKey);
        if (drawResult) {
            this.isGameOver = true;
            this.stopClock();
            this.playSound('gameEnd');
            document.getElementById('game-status').textContent = drawResult;
            if (this.gameMode === 'computer') {
                setTimeout(() => this.sendGameMessage('gameEnd', 'draw'), 500);
            }
            this.updateBoard(false);
            this.updateGameButtons();
            return;
        }

        const inCheck = this.isInCheck(this.currentPlayer);
        const hasValidMoves = this.hasAnyValidMoves(this.currentPlayer);
        const isCheckmate = inCheck && !hasValidMoves;

        // Add move to notation history
        const lastMove = this.moveHistory[this.moveHistory.length - 1];
        if (lastMove) {
            const notation = this.getMoveNotation(lastMove, inCheck, isCheckmate);
            this.notationHistory.push(notation);
            this.updateMoveHistory();
        }

        // Analyze opponent's move with the coach (when it's now the player's turn)
        if (this.gameMode === 'computer' && this.currentPlayer === this.playerColor) {
            const lastMoveData = this.moveHistory[this.moveHistory.length - 1];
            if (lastMoveData) {
                setTimeout(() => {
                    this.analyzeOpponentMove(lastMoveData);
                }, 400);
            }
        }

        // Handle game state and chat messages
        if (this.gameMode === 'computer') {
            const lastMoveData = this.moveHistory[this.moveHistory.length - 1];
            const playerJustMoved = previousPlayer === this.playerColor;

            if (!hasValidMoves) {
                this.isGameOver = true;
                this.stopClock();
                this.playSound('gameEnd');
                if (inCheck) {
                    const winner = this.currentPlayer === 'white' ? 'Black' : 'White';
                    document.getElementById('game-status').textContent = `Checkmate! ${winner} wins!`;
                    setTimeout(() => {
                        if (this.currentPlayer !== this.playerColor) {
                            this.sendGameMessage('gameEnd', 'playerWin');
                            if (this.accountSystem && this.gameStartTime) {
                                const gameTime = Math.floor((Date.now() - this.gameStartTime) / 1000);
                                this.accountSystem.recordWin(this.selectedOpponent, gameTime);
                            }
                        } else {
                            this.sendGameMessage('gameEnd', 'opponentWin');
                        }
                    }, 500);
                } else {
                    document.getElementById('game-status').textContent = 'Stalemate! Draw!';
                    setTimeout(() => this.sendGameMessage('gameEnd', 'draw'), 500);
                }
            } else if (inCheck) {
                document.getElementById('game-status').textContent = 'Check!';
                this.playSound('check');
                this.handleChatTriggers(playerJustMoved, lastMoveData, inCheck);
            } else {
                document.getElementById('game-status').textContent = '';
                this.handleChatTriggers(playerJustMoved, lastMoveData, inCheck);
            }
        } else {
            if (!hasValidMoves) {
                this.isGameOver = true;
                this.stopClock();
                this.playSound('gameEnd');
                if (inCheck) {
                    const winner = this.currentPlayer === 'white' ? 'Black' : 'White';
                    document.getElementById('game-status').textContent = `Checkmate! ${winner} wins!`;
                } else {
                    document.getElementById('game-status').textContent = 'Stalemate! Draw!';
                }
            } else if (inCheck) {
                document.getElementById('game-status').textContent = 'Check!';
                this.playSound('check');
            } else {
                document.getElementById('game-status').textContent = '';
            }
        }

        this.updateBoard(inCheck);
        this.updateGameButtons();

        // If computer's turn, make engine move with realistic thinking delay
        if (!this.isGameOver && this.gameMode === 'computer' && this.currentPlayer !== this.playerColor) {
            const thinkDelay = this.calculateThinkingDelay();
            setTimeout(() => this.makeEngineMove(), thinkDelay);
        }
    }

    calculateThinkingDelay() {
        const opponent = this.opponents[this.selectedOpponent];
        const baseDelay = 150;

        // Lower ELO players think faster (less analysis)
        // Higher ELO players take more time
        let eloFactor = 1;
        if (opponent.elo < 500) {
            eloFactor = 0.2 + Math.random() * 0.3; // 0.2-0.5x
        } else if (opponent.elo < 1000) {
            eloFactor = 0.3 + Math.random() * 0.4; // 0.3-0.7x
        } else if (opponent.elo < 1500) {
            eloFactor = 0.5 + Math.random() * 0.5; // 0.5-1.0x
        } else {
            eloFactor = 0.7 + Math.random() * 0.8; // 0.7-1.5x
        }

        // Opening moves are faster (known theory)
        const openingFactor = this.moveCount < 10 ? 0.5 : 1.0;

        // Calculate final delay (200ms - 2000ms range)
        const delay = baseDelay + (600 * eloFactor * openingFactor);
        return Math.min(2000, Math.max(200, delay));
    }

    getPositionKey() {
        // Create a unique key for the current position
        let key = '';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece) {
                    key += `${piece.color[0]}${piece.type[0]}${r}${c}`;
                }
            }
        }
        key += this.currentPlayer;
        key += JSON.stringify(this.castlingRights);
        if (this.enPassantTarget) {
            key += `${this.enPassantTarget.row}${this.enPassantTarget.col}`;
        }
        return key;
    }

    checkForDraw(positionKey) {
        // Check 75-move rule
        if (this.halfMoveClock >= 150) {
            return 'Draw by 75-move rule!';
        }

        // Check threefold repetition using Map for O(1) lookup
        const occurrences = this.positionCounts.get(positionKey) || 0;
        if (occurrences >= 3) {
            return 'Draw by threefold repetition!';
        }

        // Check insufficient material
        if (this.isInsufficientMaterial()) {
            return 'Draw by insufficient material!';
        }

        return null;
    }

    isInsufficientMaterial() {
        const pieces = { white: [], black: [] };

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece && piece.type !== 'king') {
                    pieces[piece.color].push(piece.type);
                }
            }
        }

        const whitePieces = pieces.white;
        const blackPieces = pieces.black;

        // King vs King
        if (whitePieces.length === 0 && blackPieces.length === 0) {
            return true;
        }

        // King + Bishop vs King or King + Knight vs King
        if (whitePieces.length === 0 && blackPieces.length === 1) {
            if (blackPieces[0] === 'bishop' || blackPieces[0] === 'knight') {
                return true;
            }
        }
        if (blackPieces.length === 0 && whitePieces.length === 1) {
            if (whitePieces[0] === 'bishop' || whitePieces[0] === 'knight') {
                return true;
            }
        }

        // King + Bishop vs King + Bishop (same color bishops)
        if (whitePieces.length === 1 && blackPieces.length === 1 &&
            whitePieces[0] === 'bishop' && blackPieces[0] === 'bishop') {
            // Check if bishops are on same color squares
            let whiteBishopSquare = null;
            let blackBishopSquare = null;

            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const piece = this.board[r][c];
                    if (piece && piece.type === 'bishop') {
                        if (piece.color === 'white') {
                            whiteBishopSquare = (r + c) % 2;
                        } else {
                            blackBishopSquare = (r + c) % 2;
                        }
                    }
                }
            }

            if (whiteBishopSquare === blackBishopSquare) {
                return true;
            }
        }

        return false;
    }

    makeEngineMove() {
        if (!this.engine || !this.engineReady || this.isThinking) return;

        this.isThinking = true;
        document.getElementById('board').classList.add('thinking');
        this.updateNameplates();

        const opponent = this.opponents[this.selectedOpponent];
        document.getElementById('engine-status').textContent = `${opponent.name} is thinking...`;

        // Send thinking message with tier-aware frequency
        const tier = this.getPersonalityTier();
        const thinkChance = { baby: 0.5, casual: 0.4, club: 0.35, skilled: 0.3, advanced: 0.25, master: 0.2, engine: 0.15 }[tier] || 0.3;
        if (Math.random() < thinkChance && this.canSendChat('thinking')) {
            this.sendGameMessage('thinking');
            this.recordChat('thinking');
        }

        // For weak bots, sometimes play a random legal move instead of asking the engine
        if (opponent.randomMoveChance > 0 && Math.random() < opponent.randomMoveChance) {
            const randomMove = this.getRandomLegalMoveUCI();
            if (randomMove) {
                // Add a small delay so it doesn't feel instant
                setTimeout(() => {
                    this.applyEngineMove(randomMove);
                    this.isThinking = false;
                    document.getElementById('board').classList.remove('thinking');
                    this.updateNameplates();
                    document.getElementById('engine-status').textContent = '';
                }, 300 + Math.random() * 700);
                return;
            }
        }

        const fen = this.generateFEN();
        this.engine.postMessage(`position fen ${fen}`);
        this.engine.postMessage(`go depth ${opponent.depth} movetime 4500`);
    }

    applyEngineMove(moveStr) {
        // Parse UCI move format (e.g., "e2e4", "e7e8q" for promotion)
        const fromCol = moveStr.charCodeAt(0) - 97;
        const fromRow = 8 - parseInt(moveStr[1]);
        const toCol = moveStr.charCodeAt(2) - 97;
        const toRow = 8 - parseInt(moveStr[3]);

        let promotionPiece = null;
        if (moveStr.length === 5) {
            const promoChar = moveStr[4].toLowerCase();
            const promoMap = { 'q': 'queen', 'r': 'rook', 'b': 'bishop', 'n': 'knight' };
            promotionPiece = promoMap[promoChar];
        }

        // Animate the engine's move
        this.animateMove(fromRow, fromCol, toRow, toCol, promotionPiece);
    }

    generateFEN() {
        let fen = '';

        // Piece placement
        for (let row = 0; row < 8; row++) {
            let emptyCount = 0;
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece) {
                    if (emptyCount > 0) {
                        fen += emptyCount;
                        emptyCount = 0;
                    }
                    const pieceChar = this.getPieceChar(piece);
                    fen += piece.color === 'white' ? pieceChar.toUpperCase() : pieceChar.toLowerCase();
                } else {
                    emptyCount++;
                }
            }
            if (emptyCount > 0) {
                fen += emptyCount;
            }
            if (row < 7) fen += '/';
        }

        // Active color
        fen += ' ' + (this.currentPlayer === 'white' ? 'w' : 'b');

        // Castling rights
        let castling = '';
        if (this.castlingRights.white.kingSide) castling += 'K';
        if (this.castlingRights.white.queenSide) castling += 'Q';
        if (this.castlingRights.black.kingSide) castling += 'k';
        if (this.castlingRights.black.queenSide) castling += 'q';
        fen += ' ' + (castling || '-');

        // En passant
        if (this.enPassantTarget) {
            const file = String.fromCharCode(97 + this.enPassantTarget.col);
            const rank = 8 - this.enPassantTarget.row;
            fen += ' ' + file + rank;
        } else {
            fen += ' -';
        }

        // Halfmove clock and fullmove number
        fen += ' ' + this.halfMoveClock + ' ' + this.fullMoveNumber;

        return fen;
    }

    getPieceChar(piece) {
        const charMap = {
            'king': 'k',
            'queen': 'q',
            'rook': 'r',
            'bishop': 'b',
            'knight': 'n',
            'pawn': 'p'
        };
        return charMap[piece.type];
    }

    getValidMoves(row, col) {
        const piece = this.board[row][col];
        if (!piece) return [];

        let moves = [];

        switch (piece.type) {
            case 'pawn':
                moves = this.getPawnMoves(row, col, piece.color);
                break;
            case 'knight':
                moves = this.getKnightMoves(row, col, piece.color);
                break;
            case 'bishop':
                moves = this.getBishopMoves(row, col, piece.color);
                break;
            case 'rook':
                moves = this.getRookMoves(row, col, piece.color);
                break;
            case 'queen':
                moves = this.getQueenMoves(row, col, piece.color);
                break;
            case 'king':
                moves = this.getKingMoves(row, col, piece.color);
                break;
        }

        // Filter out moves that would leave the king in check
        moves = moves.filter(move => {
            return !this.wouldBeInCheck(row, col, move.row, move.col, piece.color);
        });

        return moves;
    }

    getPawnMoves(row, col, color) {
        const moves = [];
        const direction = color === 'white' ? -1 : 1;
        const startRow = color === 'white' ? 6 : 1;

        // Forward move
        if (this.isValidSquare(row + direction, col) && !this.board[row + direction][col]) {
            moves.push({ row: row + direction, col: col });

            // Double move from starting position
            if (row === startRow && !this.board[row + 2 * direction][col]) {
                moves.push({ row: row + 2 * direction, col: col });
            }
        }

        // Captures
        for (const dcol of [-1, 1]) {
            const newCol = col + dcol;
            if (this.isValidSquare(row + direction, newCol)) {
                const target = this.board[row + direction][newCol];
                if (target && target.color !== color) {
                    moves.push({ row: row + direction, col: newCol });
                }

                // En passant
                if (this.enPassantTarget &&
                    row + direction === this.enPassantTarget.row &&
                    newCol === this.enPassantTarget.col) {
                    moves.push({ row: row + direction, col: newCol });
                }
            }
        }

        return moves;
    }

    getKnightMoves(row, col, color) {
        const moves = [];
        const offsets = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1]
        ];

        for (const [drow, dcol] of offsets) {
            const newRow = row + drow;
            const newCol = col + dcol;
            if (this.isValidSquare(newRow, newCol)) {
                const target = this.board[newRow][newCol];
                if (!target || target.color !== color) {
                    moves.push({ row: newRow, col: newCol });
                }
            }
        }

        return moves;
    }

    getBishopMoves(row, col, color) {
        return this.getSlidingMoves(row, col, color, [[-1, -1], [-1, 1], [1, -1], [1, 1]]);
    }

    getRookMoves(row, col, color) {
        return this.getSlidingMoves(row, col, color, [[-1, 0], [1, 0], [0, -1], [0, 1]]);
    }

    getQueenMoves(row, col, color) {
        return this.getSlidingMoves(row, col, color, [
            [-1, -1], [-1, 1], [1, -1], [1, 1],
            [-1, 0], [1, 0], [0, -1], [0, 1]
        ]);
    }

    getSlidingMoves(row, col, color, directions) {
        const moves = [];

        for (const [drow, dcol] of directions) {
            let newRow = row + drow;
            let newCol = col + dcol;

            while (this.isValidSquare(newRow, newCol)) {
                const target = this.board[newRow][newCol];
                if (!target) {
                    moves.push({ row: newRow, col: newCol });
                } else {
                    if (target.color !== color) {
                        moves.push({ row: newRow, col: newCol });
                    }
                    break;
                }
                newRow += drow;
                newCol += dcol;
            }
        }

        return moves;
    }

    getKingMoves(row, col, color) {
        const moves = [];
        const offsets = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1], [0, 1],
            [1, -1], [1, 0], [1, 1]
        ];

        for (const [drow, dcol] of offsets) {
            const newRow = row + drow;
            const newCol = col + dcol;
            if (this.isValidSquare(newRow, newCol)) {
                const target = this.board[newRow][newCol];
                if (!target || target.color !== color) {
                    moves.push({ row: newRow, col: newCol });
                }
            }
        }

        // Castling
        if (!this.isInCheck(color)) {
            const kingRow = color === 'white' ? 7 : 0;

            // King-side castling
            if (this.castlingRights[color].kingSide) {
                if (!this.board[kingRow][5] && !this.board[kingRow][6]) {
                    if (!this.isSquareAttacked(kingRow, 5, color) &&
                        !this.isSquareAttacked(kingRow, 6, color)) {
                        moves.push({ row: kingRow, col: 6 });
                    }
                }
            }

            // Queen-side castling
            if (this.castlingRights[color].queenSide) {
                if (!this.board[kingRow][1] && !this.board[kingRow][2] && !this.board[kingRow][3]) {
                    if (!this.isSquareAttacked(kingRow, 2, color) &&
                        !this.isSquareAttacked(kingRow, 3, color)) {
                        moves.push({ row: kingRow, col: 2 });
                    }
                }
            }
        }

        return moves;
    }

    isValidSquare(row, col) {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }

    findKing(color) {
        return this.kingPos[color];
    }

    isInCheck(color) {
        const kingPos = this.findKing(color);
        if (!kingPos) return false;
        return this.isSquareAttacked(kingPos.row, kingPos.col, color);
    }

    isSquareAttacked(row, col, defendingColor) {
        const attackingColor = defendingColor === 'white' ? 'black' : 'white';
        const pawnDir = attackingColor === 'white' ? 1 : -1;

        // Check pawn attacks
        for (const dc of [-1, 1]) {
            const pr = row + pawnDir;
            const pc = col + dc;
            if (pr >= 0 && pr < 8 && pc >= 0 && pc < 8) {
                const p = this.board[pr][pc];
                if (p && p.color === attackingColor && p.type === 'pawn') return true;
            }
        }

        // Check knight attacks
        const knightOffsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of knightOffsets) {
            const nr = row + dr, nc = col + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const p = this.board[nr][nc];
                if (p && p.color === attackingColor && p.type === 'knight') return true;
            }
        }

        // Check king attacks
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = row + dr, nc = col + dc;
                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                    const p = this.board[nr][nc];
                    if (p && p.color === attackingColor && p.type === 'king') return true;
                }
            }
        }

        // Check sliding pieces (bishop/queen on diagonals, rook/queen on straights)
        const directions = [
            { dr: -1, dc: 0, types: ['rook', 'queen'] },
            { dr: 1, dc: 0, types: ['rook', 'queen'] },
            { dr: 0, dc: -1, types: ['rook', 'queen'] },
            { dr: 0, dc: 1, types: ['rook', 'queen'] },
            { dr: -1, dc: -1, types: ['bishop', 'queen'] },
            { dr: -1, dc: 1, types: ['bishop', 'queen'] },
            { dr: 1, dc: -1, types: ['bishop', 'queen'] },
            { dr: 1, dc: 1, types: ['bishop', 'queen'] },
        ];

        for (const { dr, dc, types } of directions) {
            let nr = row + dr, nc = col + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const p = this.board[nr][nc];
                if (p) {
                    if (p.color === attackingColor && types.includes(p.type)) return true;
                    break; // blocked by any piece
                }
                nr += dr;
                nc += dc;
            }
        }

        return false;
    }

    getAttackSquares(row, col, piece) {
        switch (piece.type) {
            case 'pawn':
                return this.getPawnAttacks(row, col, piece.color);
            case 'knight':
                return this.getKnightMoves(row, col, piece.color);
            case 'bishop':
                return this.getBishopMoves(row, col, piece.color);
            case 'rook':
                return this.getRookMoves(row, col, piece.color);
            case 'queen':
                return this.getQueenMoves(row, col, piece.color);
            case 'king':
                return this.getKingAttacks(row, col);
            default:
                return [];
        }
    }

    getPawnAttacks(row, col, color) {
        const attacks = [];
        const direction = color === 'white' ? -1 : 1;

        for (const dcol of [-1, 1]) {
            const newCol = col + dcol;
            if (this.isValidSquare(row + direction, newCol)) {
                attacks.push({ row: row + direction, col: newCol });
            }
        }
        return attacks;
    }

    getKingAttacks(row, col) {
        const attacks = [];
        const offsets = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1], [0, 1],
            [1, -1], [1, 0], [1, 1]
        ];

        for (const [drow, dcol] of offsets) {
            const newRow = row + drow;
            const newCol = col + dcol;
            if (this.isValidSquare(newRow, newCol)) {
                attacks.push({ row: newRow, col: newCol });
            }
        }
        return attacks;
    }

    wouldBeInCheck(fromRow, fromCol, toRow, toCol, color) {
        // Make temporary move
        const piece = this.board[fromRow][fromCol];
        const capturedPiece = this.board[toRow][toCol];

        // Handle en passant capture
        let enPassantCaptured = null;
        let enPassantRow = null;
        if (piece.type === 'pawn' && this.enPassantTarget &&
            toRow === this.enPassantTarget.row && toCol === this.enPassantTarget.col) {
            enPassantRow = color === 'white' ? toRow + 1 : toRow - 1;
            enPassantCaptured = this.board[enPassantRow][toCol];
            this.board[enPassantRow][toCol] = null;
        }

        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;

        // Temporarily update king cache if king is moving
        let savedKingPos = null;
        if (piece.type === 'king') {
            savedKingPos = this.kingPos[color];
            this.kingPos[color] = { row: toRow, col: toCol };
        }

        const inCheck = this.isInCheck(color);

        // Restore board
        this.board[fromRow][fromCol] = piece;
        this.board[toRow][toCol] = capturedPiece;

        if (savedKingPos) {
            this.kingPos[color] = savedKingPos;
        }

        if (enPassantCaptured !== null) {
            this.board[enPassantRow][toCol] = enPassantCaptured;
        }

        return inCheck;
    }

    hasAnyValidMoves(color) {
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.color === color) {
                    // Generate raw moves for this piece
                    let moves;
                    switch (piece.type) {
                        case 'pawn': moves = this.getPawnMoves(row, col, piece.color); break;
                        case 'knight': moves = this.getKnightMoves(row, col, piece.color); break;
                        case 'bishop': moves = this.getBishopMoves(row, col, piece.color); break;
                        case 'rook': moves = this.getRookMoves(row, col, piece.color); break;
                        case 'queen': moves = this.getQueenMoves(row, col, piece.color); break;
                        case 'king': moves = this.getKingMoves(row, col, piece.color); break;
                        default: continue;
                    }
                    // Return true as soon as we find ONE legal move
                    for (const move of moves) {
                        if (!this.wouldBeInCheck(row, col, move.row, move.col, piece.color)) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    updateGameInfo() {
        const turnIndicator = document.getElementById('turn-indicator');
        turnIndicator.textContent = `${this.currentPlayer.charAt(0).toUpperCase() + this.currentPlayer.slice(1)}'s Turn`;

        // Update nameplates
        this.updateNameplates();
    }

    updateNameplates() {
        const playerNameplate = document.getElementById('nameplate-player');
        const opponentNameplate = document.getElementById('nameplate-opponent');

        if (!playerNameplate || !opponentNameplate) return;

        // Determine who's turn it is
        const isPlayerTurn = this.currentPlayer === this.playerColor;

        // Update active states
        playerNameplate.classList.toggle('active', isPlayerTurn);
        opponentNameplate.classList.toggle('active', !isPlayerTurn);

        // Update thinking state for opponent
        opponentNameplate.classList.toggle('thinking', this.isThinking);
    }

    updateNameplateInfo() {
        const opponentAvatar = document.getElementById('opponent-nameplate-avatar');
        const opponentName = document.getElementById('opponent-nameplate-name');
        const opponentElo = document.getElementById('opponent-nameplate-elo');

        if (!opponentAvatar || !opponentName || !opponentElo) return;

        if (this.gameMode === 'computer') {
            const opponent = this.opponents[this.selectedOpponent];
            opponentAvatar.textContent = opponent.avatar;
            opponentName.textContent = opponent.name;
            opponentElo.textContent = `${opponent.elo} ELO`;
        } else if (this.gameMode === 'online') {
            opponentAvatar.textContent = '🌐';
            opponentName.textContent = this.opponentName || 'Opponent';
            opponentElo.textContent = 'Online';
        } else {
            opponentAvatar.textContent = '👤';
            opponentName.textContent = 'Player 2';
            opponentElo.textContent = 'Human';
        }
    }

    _buildCapturedPieceElements(container, pieces, extraClass) {
        container.innerHTML = '';
        for (const p of pieces) {
            const img = document.createElement('img');
            img.src = this.pieceImages[p.color][p.type];
            img.alt = p.type;
            img.draggable = false;
            if (extraClass) img.className = extraClass;
            container.appendChild(img);
        }
    }

    updateCapturedPieces() {
        const whiteCaptured = document.getElementById('white-captured');
        const blackCaptured = document.getElementById('black-captured');

        this._buildCapturedPieceElements(whiteCaptured, this.capturedPieces.white, 'captured-piece');
        this._buildCapturedPieceElements(blackCaptured, this.capturedPieces.black, 'captured-piece');

        this.updateTrayPieces();
    }

    updateTrayPieces() {
        const playerTray = document.getElementById('player-tray-pieces');
        const opponentTray = document.getElementById('opponent-tray-pieces');

        if (!playerTray || !opponentTray) return;

        const playerCaptured = this.playerColor === 'white'
            ? this.capturedPieces.white
            : this.capturedPieces.black;

        const opponentCaptured = this.playerColor === 'white'
            ? this.capturedPieces.black
            : this.capturedPieces.white;

        this._buildCapturedPieceElements(playerTray, playerCaptured);
        this._buildCapturedPieceElements(opponentTray, opponentCaptured);
    }

    // Online multiplayer methods
    generateLobbyCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    getPlayerDisplayName() {
        if (this.accountSystem && this.accountSystem.currentUser) {
            return this.accountSystem.currentUser.username || 'Player';
        }
        return 'Player';
    }

    createLobby() {
        this.lobbyCode = this.generateLobbyCode();
        this.isHost = true;
        this.playerColor = 'white';
        this.opponentJoined = false;

        document.getElementById('lobby-code-text').textContent = this.lobbyCode;
        document.getElementById('lobby-code-display').classList.remove('hidden');
        document.getElementById('lobby-create-btn').disabled = true;

        this.setupChannel();
    }

    joinLobby(code) {
        this.lobbyCode = code.toUpperCase();
        this.isHost = false;
        this.playerColor = 'black';

        const errorEl = document.getElementById('lobby-error');
        const joiningEl = document.getElementById('lobby-joining');
        errorEl.textContent = '';
        joiningEl.classList.remove('hidden');
        document.getElementById('lobby-join-btn').disabled = true;

        this.setupChannel(() => {
            // On successful subscribe, notify host
            const userName = this.getPlayerDisplayName();
            this.channel.send({
                type: 'broadcast',
                event: 'player-joined',
                payload: { name: userName }
            });
        }, () => {
            // On error
            errorEl.textContent = 'Failed to connect. Check the code and try again.';
            joiningEl.classList.add('hidden');
            document.getElementById('lobby-join-btn').disabled = false;
        });
    }

    setupChannel(onSubscribed = null, onError = null) {
        try {
            this.channel = supabase.channel(`chess-${this.lobbyCode}`, {
                config: { broadcast: { self: false } }
            });

            this.channel
                .on('broadcast', { event: 'player-joined' }, (payload) => {
                    this.opponentJoined = true;
                    this.opponentName = payload.payload.name || 'Opponent';
                    document.getElementById('lobby-waiting').textContent =
                        `${this.opponentName} joined! Starting game...`;
                    setTimeout(() => this.startOnlineGame(), 1000);
                })
                .on('broadcast', { event: 'game-start' }, (payload) => {
                    this.opponentName = payload.payload.hostName || 'Opponent';
                    this.startOnlineGame();
                })
                .on('broadcast', { event: 'move' }, (payload) => {
                    this.handleRemoteMove(payload.payload);
                })
                .on('broadcast', { event: 'resign' }, () => {
                    this.handleRemoteResign();
                })
                .on('broadcast', { event: 'offer-draw' }, () => {
                    this.handleRemoteDrawOffer();
                })
                .on('broadcast', { event: 'accept-draw' }, () => {
                    this.handleRemoteDrawAccept();
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED' && onSubscribed) {
                        onSubscribed();
                    } else if (status === 'CHANNEL_ERROR' && onError) {
                        onError();
                    }
                });
        } catch (err) {
            console.error('Failed to create lobby channel:', err);
            if (onError) onError();
        }
    }

    startOnlineGame() {
        document.getElementById('lobby-modal').classList.add('hidden');

        this.gameMode = 'online';
        document.getElementById('game-mode').value = 'online';

        this.initBoard();
        this.renderBoard();
        document.getElementById('game-status').textContent = '';
        document.getElementById('engine-status').textContent = '';

        this.updateOnlineNameplateInfo();
        this.updateNameplates();
        this.resetClocks();
        this.startClock();
        this.clearMoveHistory();
        this.gameStartTime = Date.now();
        this.moveCount = 0;

        document.getElementById('chat-panel').classList.add('hidden');
        document.getElementById('coach-panel').classList.add('hidden');
        document.getElementById('opponent-select').classList.add('hidden');
        document.getElementById('color-group').style.display = 'none';

        if (this.isHost) {
            this.channel.send({
                type: 'broadcast',
                event: 'game-start',
                payload: { hostName: this.getPlayerDisplayName() }
            });
        }
    }

    updateOnlineNameplateInfo() {
        const opponentAvatar = document.getElementById('opponent-nameplate-avatar');
        const opponentName = document.getElementById('opponent-nameplate-name');
        const opponentElo = document.getElementById('opponent-nameplate-elo');
        if (!opponentAvatar || !opponentName || !opponentElo) return;

        opponentAvatar.textContent = '🌐';
        opponentName.textContent = this.opponentName || 'Opponent';
        opponentElo.textContent = 'Online';
    }

    sendMove(fromRow, fromCol, toRow, toCol, promotionPiece = null) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'move',
            payload: {
                from: { row: fromRow, col: fromCol },
                to: { row: toRow, col: toCol },
                promotionPiece: promotionPiece
            }
        });
    }

    handleRemoteMove(payload) {
        if (this.isGameOver) return;
        const { from, to, promotionPiece } = payload;
        this.isRemoteMove = true;
        this.animateMove(from.row, from.col, to.row, to.col, promotionPiece);
    }

    handleRemoteResign() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.stopClock();
        this.playSound('gameEnd');
        const winner = this.playerColor === 'white' ? 'White' : 'Black';
        document.getElementById('game-status').textContent =
            `Opponent resigned. ${winner} wins!`;
        this.updateGameButtons();
    }

    handleRemoteDrawOffer() {
        if (this.isGameOver) return;
        const accept = confirm('Your opponent offers a draw. Accept?');
        if (accept) {
            this.channel.send({
                type: 'broadcast',
                event: 'accept-draw',
                payload: {}
            });
            this.isGameOver = true;
            this.stopClock();
            this.playSound('gameEnd');
            document.getElementById('game-status').textContent = 'Draw agreed!';
            this.updateGameButtons();
        }
    }

    handleRemoteDrawAccept() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.stopClock();
        this.playSound('gameEnd');
        document.getElementById('game-status').textContent = 'Draw agreed!';
        this.updateGameButtons();
    }

    cleanupOnlineGame() {
        if (this.channel) {
            supabase.removeChannel(this.channel);
            this.channel = null;
        }
        this.lobbyCode = null;
        this.isHost = false;
        this.isRemoteMove = false;
        this.opponentJoined = false;
        this.opponentName = null;
    }

    showLobbyModal() {
        document.getElementById('lobby-code-display').classList.add('hidden');
        document.getElementById('lobby-create-btn').disabled = false;
        document.getElementById('lobby-code-input').value = '';
        document.getElementById('lobby-error').textContent = '';
        document.getElementById('lobby-joining').classList.add('hidden');
        document.getElementById('lobby-join-btn').disabled = false;
        document.querySelectorAll('.lobby-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.lobby-tab[data-tab="create"]').classList.add('active');
        document.getElementById('lobby-create').classList.remove('hidden');
        document.getElementById('lobby-join').classList.add('hidden');
        document.getElementById('lobby-modal').classList.remove('hidden');
    }

    // Chess clock methods
    startClock() {
        if (!this.clockEnabled || this.clockInterval) return;

        this.lastClockUpdate = Date.now();
        this.clockInterval = setInterval(() => this.tickClock(), 100);
    }

    stopClock() {
        if (this.clockInterval) {
            clearInterval(this.clockInterval);
            this.clockInterval = null;
        }
    }

    tickClock() {
        if (this.isGameOver) {
            this.stopClock();
            return;
        }

        const now = Date.now();
        const elapsed = (now - this.lastClockUpdate) / 1000;
        this.lastClockUpdate = now;

        // Determine whose clock to decrement based on whose turn it is
        const isPlayerTurn = this.currentPlayer === this.playerColor;

        if (isPlayerTurn) {
            this.playerTime = Math.max(0, this.playerTime - elapsed);
            if (this.playerTime <= 0) {
                this.handleTimeOut('player');
            }
        } else {
            this.opponentTime = Math.max(0, this.opponentTime - elapsed);
            if (this.opponentTime <= 0) {
                this.handleTimeOut('opponent');
            }
        }

        this.updateClockDisplay();
    }

    handleTimeOut(who) {
        this.stopClock();
        this.isGameOver = true;
        this.playSound('gameEnd');

        if (who === 'player') {
            document.getElementById('game-status').textContent = 'Time out! You lose on time.';
            if (this.gameMode === 'computer') {
                setTimeout(() => this.sendGameMessage('gameEnd', 'opponentWin'), 500);
            }
        } else {
            document.getElementById('game-status').textContent = 'Time out! You win on time!';
            if (this.gameMode === 'computer') {
                setTimeout(() => this.sendGameMessage('gameEnd', 'playerWin'), 500);
                // Record win to leaderboard
                if (this.accountSystem && this.gameStartTime) {
                    const gameTime = Math.floor((Date.now() - this.gameStartTime) / 1000);
                    this.accountSystem.recordWin(this.selectedOpponent, gameTime);
                }
            }
        }
    }

    updateClockDisplay() {
        const playerTimeStr = this.formatTime(this.playerTime);
        const opponentTimeStr = this.formatTime(this.opponentTime);

        // Only update DOM when displayed text actually changes
        if (this._lastPlayerTimeStr !== playerTimeStr) {
            this._lastPlayerTimeStr = playerTimeStr;
            const playerTimeEl = document.getElementById('player-time');
            if (playerTimeEl) playerTimeEl.textContent = playerTimeStr;

            const playerClockEl = document.getElementById('player-clock');
            if (playerClockEl) playerClockEl.classList.toggle('low-time', this.playerTime < 60);
        }

        if (this._lastOpponentTimeStr !== opponentTimeStr) {
            this._lastOpponentTimeStr = opponentTimeStr;
            const opponentTimeEl = document.getElementById('opponent-time');
            if (opponentTimeEl) opponentTimeEl.textContent = opponentTimeStr;

            const opponentClockEl = document.getElementById('opponent-clock');
            if (opponentClockEl) opponentClockEl.classList.toggle('low-time', this.opponentTime < 60);
        }
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    resetClocks() {
        this.stopClock();
        // Get current time control selection
        const timeControlEl = document.getElementById('time-control');
        if (timeControlEl) {
            this.timeControl = timeControlEl.value;
            this.initialTime = this.timeControls[this.timeControl].initial;
            this.increment = this.timeControls[this.timeControl].increment;
        }
        this.playerTime = this.initialTime;
        this.opponentTime = this.initialTime;
        this.positionHistory = [];
        this.positionCounts = new Map();
        this._lastCapturedCount = 0;
        this.drawOffered = false;
        this.updateClockDisplay();
        this.updateGameButtons();
    }

    // Move history methods
    getMoveNotation(move, wasCheck = false, wasCheckmate = false) {
        const { from, to, piece, captured } = move;
        const pieceSymbols = { king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: '' };
        const files = 'abcdefgh';
        const ranks = '87654321';

        const fromFile = files[from.col];
        const toFile = files[to.col];
        const toRank = ranks[to.row];

        // Castling
        if (piece.type === 'king' && Math.abs(to.col - from.col) === 2) {
            return to.col > from.col ? 'O-O' : 'O-O-O';
        }

        let notation = '';

        // Piece symbol (not for pawns)
        if (piece.type !== 'pawn') {
            notation += pieceSymbols[piece.type];
        }

        // For pawns capturing, include the file
        if (piece.type === 'pawn' && captured) {
            notation += fromFile;
        }

        // Capture symbol
        if (captured) {
            notation += 'x';
        }

        // Destination square
        notation += toFile + toRank;

        // Promotion (simplified - always queen for notation)
        if (piece.type === 'pawn' && (to.row === 0 || to.row === 7)) {
            notation += '=Q';
        }

        // Check/checkmate
        if (wasCheckmate) {
            notation += '#';
        } else if (wasCheck) {
            notation += '+';
        }

        return notation;
    }

    updateMoveHistory() {
        const container = document.getElementById('move-history');
        if (!container) return;

        const moves = this.notationHistory || [];
        if (moves.length === 0) return;

        // Remove 'move-current' from previous move
        const prev = container.querySelector('.move-current');
        if (prev) prev.classList.remove('move-current');

        const lastIndex = moves.length - 1;
        const isWhiteMove = lastIndex % 2 === 0;

        if (isWhiteMove) {
            // New pair needed (white's move starts a new row)
            const pair = document.createElement('div');
            pair.className = 'move-pair';

            const numSpan = document.createElement('span');
            numSpan.className = 'move-number';
            numSpan.textContent = Math.floor(lastIndex / 2 + 1) + '.';
            pair.appendChild(numSpan);

            const whiteMove = document.createElement('span');
            whiteMove.className = 'move-white move-current';
            whiteMove.textContent = moves[lastIndex];
            pair.appendChild(whiteMove);

            container.appendChild(pair);
        } else {
            // Append black's move to the last pair
            const lastPair = container.lastElementChild;
            if (lastPair) {
                const blackMove = document.createElement('span');
                blackMove.className = 'move-black move-current';
                blackMove.textContent = moves[lastIndex];
                lastPair.appendChild(blackMove);
            }
        }

        container.scrollTop = container.scrollHeight;
    }

    clearMoveHistory() {
        this.notationHistory = [];
        const container = document.getElementById('move-history');
        if (container) container.innerHTML = '';
    }
}

// Start the game
document.addEventListener('DOMContentLoaded', () => {
    const game = new ChessGame();

    // Initialize Account System
    const accountSystem = new AccountSystem(game);
    game.accountSystem = accountSystem;

    // Listen for pause/resume from parent (chat app blur protection)
    window.addEventListener('message', (e) => {
        if (e.data === 'pause-clock') {
            game.stopClock();
        } else if (e.data === 'resume-clock') {
            game.startClock();
        }
    });

    // Clean up online game on page unload
    window.addEventListener('beforeunload', () => {
        game.cleanupOnlineGame();
    });
});

// Account and Leaderboard System
class AccountSystem {
    constructor(game) {
        this.game = game;
        this.currentUser = null;
        this.init();
    }

    init() {
        // Load current user from localStorage
        const savedUser = localStorage.getItem('chess_current_user');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            this.updateAccountUI();
        }

        this.setupEventListeners();
        this.populateLeaderboardFilter();
    }

    setupEventListeners() {
        // Login button
        document.getElementById('login-btn')?.addEventListener('click', () => {
            document.getElementById('auth-modal').classList.remove('hidden');
        });

        // Close auth modal
        document.getElementById('auth-close')?.addEventListener('click', () => {
            document.getElementById('auth-modal').classList.add('hidden');
        });

        // Auth tabs
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const isLogin = tab.dataset.tab === 'login';
                document.getElementById('login-form').classList.toggle('hidden', !isLogin);
                document.getElementById('signup-form').classList.toggle('hidden', isLogin);
            });
        });

        // Login form
        document.getElementById('login-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });

        // Signup form
        document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleSignup();
        });

        // Clear error messages on input
        const loginInputs = ['login-email', 'login-password'];
        loginInputs.forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => {
                document.getElementById('login-error').textContent = '';
            });
        });

        const signupInputs = ['signup-username', 'signup-email', 'signup-password', 'signup-confirm'];
        signupInputs.forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => {
                document.getElementById('signup-error').textContent = '';
            });
        });

        // Leaderboard button
        document.getElementById('leaderboard-btn')?.addEventListener('click', () => {
            this.showLeaderboard();
        });

        // Close leaderboard modal
        document.getElementById('leaderboard-close')?.addEventListener('click', () => {
            document.getElementById('leaderboard-modal').classList.add('hidden');
        });

        // Leaderboard filter
        document.getElementById('leaderboard-filter')?.addEventListener('change', (e) => {
            this.renderLeaderboard(e.target.value);
        });

        // Close modals on background click
        document.getElementById('auth-modal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                e.currentTarget.classList.add('hidden');
            }
        });
        document.getElementById('leaderboard-modal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                e.currentTarget.classList.add('hidden');
            }
        });
    }

    async handleLogin() {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');

        // Clear previous errors
        errorEl.textContent = '';

        // Login with Supabase
        const result = await logIn(email, password);

        if (!result.success) {
            errorEl.textContent = result.error;
            return;
        }

        // Login successful
        this.currentUser = {
            username: result.user.user_metadata?.username || result.user.email.split('@')[0],
            email: result.user.email,
            id: result.user.id
        };
        localStorage.setItem('chess_current_user', JSON.stringify(this.currentUser));
        this.updateAccountUI();
        document.getElementById('auth-modal').classList.add('hidden');
        document.getElementById('login-form').reset();
        errorEl.textContent = '';
    }

    async handleSignup() {
        const username = document.getElementById('signup-username').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        const confirm = document.getElementById('signup-confirm').value;
        const errorEl = document.getElementById('signup-error');

        // Clear previous errors
        errorEl.textContent = '';

        if (password !== confirm) {
            errorEl.textContent = 'Passwords do not match';
            return;
        }

        if (username.length < 3) {
            errorEl.textContent = 'Username must be at least 3 characters';
            return;
        }

        if (password.length < 6) {
            errorEl.textContent = 'Password must be at least 6 characters';
            return;
        }

        // Create user with Supabase
        const result = await signUp(email, password, username);

        if (!result.success) {
            errorEl.textContent = result.error;
            return;
        }

        // Auto login
        this.currentUser = {
            username: username,
            email: email,
            id: result.user.id
        };
        localStorage.setItem('chess_current_user', JSON.stringify(this.currentUser));
        this.updateAccountUI();
        document.getElementById('auth-modal').classList.add('hidden');
        document.getElementById('signup-form').reset();
        errorEl.textContent = '';
    }

    async logout() {
        await logOut();
        this.currentUser = null;
        localStorage.removeItem('chess_current_user');
        this.updateAccountUI();
    }

    updateAccountUI() {
        const accountInfo = document.getElementById('account-info');
        if (!accountInfo) return;

        if (this.currentUser) {
            accountInfo.innerHTML = `
                <div class="user-info">
                    <span class="user-avatar">👤</span>
                    <span class="user-name">${this.escapeHtml(this.currentUser.username)}</span>
                </div>
                <button class="logout-btn" id="logout-btn">Logout</button>
            `;
            document.getElementById('logout-btn')?.addEventListener('click', () => this.logout());
        } else {
            accountInfo.innerHTML = `
                <button id="login-btn" class="account-btn">Login / Sign Up</button>
            `;
            document.getElementById('login-btn')?.addEventListener('click', () => {
                document.getElementById('auth-modal').classList.remove('hidden');
            });
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Leaderboard Methods
    populateLeaderboardFilter() {
        const filter = document.getElementById('leaderboard-filter');
        if (!filter) return;

        // Add all opponents to filter
        Object.entries(this.game.opponents).forEach(([key, opponent]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `${opponent.avatar} ${opponent.name} (${opponent.elo} ELO)`;
            filter.appendChild(option);
        });
    }

    async showLeaderboard() {
        document.getElementById('leaderboard-modal').classList.remove('hidden');
        // Sync from Supabase before rendering
        try {
            const remoteRecords = await fetchLeaderboard();
            if (remoteRecords && remoteRecords.length > 0) {
                const localRecords = this.getRawLeaderboard();
                for (const remote of remoteRecords) {
                    const existing = localRecords.find(
                        r => r.opponent === remote.opponent && r.username === remote.username
                    );
                    if (existing) {
                        if (remote.time_seconds < existing.time_seconds) {
                            existing.time_seconds = remote.time_seconds;
                        }
                    } else {
                        const opponentData = this.game.opponents[remote.opponent];
                        localRecords.push({
                            username: remote.username,
                            opponent: remote.opponent,
                            time_seconds: remote.time_seconds,
                            opponent_elo: remote.opponent_elo || (opponentData ? opponentData.elo : 0)
                        });
                    }
                }
                localStorage.setItem('chess_leaderboard', JSON.stringify(localRecords));
            }
        } catch (err) {
            console.log('Failed to sync leaderboard from Supabase:', err);
        }
        this.renderLeaderboard('all');
    }

    renderLeaderboard(filterOpponent = 'all') {
        const list = document.getElementById('leaderboard-list');
        if (!list) return;

        if (filterOpponent === 'all') {
            this.renderPlayerRankings(list);
        } else {
            this.renderOpponentRecords(list, filterOpponent);
        }
    }

    renderPlayerRankings(list) {
        const rankings = this.getPlayerRankings();

        if (rankings.length === 0) {
            list.innerHTML = '<div class="leaderboard-empty">No records yet. Beat an AI to get on the board!</div>';
            return;
        }

        list.innerHTML = rankings.map((entry, index) => {
            const opponent = this.game.opponents[entry.opponent];
            const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
            const rankDisplay = index < 3 ? ['🥇', '🥈', '🥉'][index] : `#${index + 1}`;

            return `
                <div class="leaderboard-entry ${rankClass}">
                    <div class="leaderboard-rank">${rankDisplay}</div>
                    <div class="leaderboard-player">
                        <span class="leaderboard-player-name">${this.escapeHtml(entry.username)}</span>
                        <span class="leaderboard-opponent">
                            Best: ${opponent?.avatar || '🤖'} ${opponent?.name || entry.opponent} (${entry.opponent_elo} ELO)
                        </span>
                        <span class="leaderboard-wins">${entry.wins} bot${entry.wins !== 1 ? 's' : ''} beaten</span>
                    </div>
                    <div class="leaderboard-time">
                        <div class="leaderboard-time-value">${this.formatTime(entry.time_seconds)}</div>
                        <div class="leaderboard-time-label">best time</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderOpponentRecords(list, filterOpponent) {
        const records = this.getOpponentRecords(filterOpponent);
        const opponentData = this.game.opponents[filterOpponent];

        if (records.length === 0) {
            list.innerHTML = `<div class="leaderboard-empty">No one has beaten ${opponentData?.name || filterOpponent} yet!</div>`;
            return;
        }

        list.innerHTML = records.map((record, index) => {
            const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
            const rankDisplay = index < 3 ? ['🥇', '🥈', '🥉'][index] : `#${index + 1}`;

            return `
                <div class="leaderboard-entry ${rankClass}">
                    <div class="leaderboard-rank">${rankDisplay}</div>
                    <div class="leaderboard-player">
                        <span class="leaderboard-player-name">${this.escapeHtml(record.username)}</span>
                        <span class="leaderboard-opponent">
                            vs ${opponentData?.avatar || '🤖'} ${opponentData?.name || filterOpponent}
                        </span>
                    </div>
                    <div class="leaderboard-time">
                        <div class="leaderboard-time-value">${this.formatTime(record.time_seconds)}</div>
                        <div class="leaderboard-time-label">time to win</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    recordWin(opponent, gameTimeSeconds) {
        // Always save to localStorage (works without login)
        this.saveToLocalLeaderboard(opponent, gameTimeSeconds);
        this.showWinNotification(gameTimeSeconds);

        // Also sync to Supabase if logged in
        if (this.currentUser) {
            upsertLeaderboardRecord(
                this.currentUser.id,
                this.currentUser.username,
                opponent,
                gameTimeSeconds
            ).catch(err => console.log('Supabase sync failed:', err));
        }
    }

    saveToLocalLeaderboard(opponent, timeSeconds) {
        const records = this.getRawLeaderboard();
        const username = this.currentUser?.username || 'Player';
        const opponentData = this.game.opponents[opponent];
        const elo = opponentData ? opponentData.elo : 0;
        const existing = records.find(r => r.opponent === opponent && r.username === username);

        if (existing) {
            // Only update if new time is faster
            if (timeSeconds < existing.time_seconds) {
                existing.time_seconds = timeSeconds;
            }
            // Update ELO in case custom bot ELO changed
            existing.opponent_elo = elo;
        } else {
            records.push({ username, opponent, time_seconds: timeSeconds, opponent_elo: elo });
        }

        localStorage.setItem('chess_leaderboard', JSON.stringify(records));
    }

    getRawLeaderboard() {
        try {
            return JSON.parse(localStorage.getItem('chess_leaderboard') || '[]');
        } catch (e) {
            return [];
        }
    }

    getPlayerRankings() {
        const records = this.getRawLeaderboard();
        // Group by username, find each player's best achievement (highest ELO beaten)
        const playerBest = {};
        for (const record of records) {
            const opponentData = this.game.opponents[record.opponent];
            const elo = record.opponent_elo || (opponentData ? opponentData.elo : 0);
            const username = record.username;

            if (!playerBest[username]) {
                playerBest[username] = { ...record, opponent_elo: elo, wins: 1 };
            } else {
                playerBest[username].wins++;
                // Replace if this opponent has higher ELO, or same ELO but faster time
                if (elo > playerBest[username].opponent_elo ||
                    (elo === playerBest[username].opponent_elo && record.time_seconds < playerBest[username].time_seconds)) {
                    playerBest[username] = { ...record, opponent_elo: elo, wins: playerBest[username].wins };
                }
            }
        }

        // Sort: highest ELO desc, then fastest time asc
        return Object.values(playerBest).sort((a, b) => {
            if (b.opponent_elo !== a.opponent_elo) return b.opponent_elo - a.opponent_elo;
            return a.time_seconds - b.time_seconds;
        }).slice(0, 100);
    }

    getOpponentRecords(filterOpponent) {
        const records = this.getRawLeaderboard().filter(r => r.opponent === filterOpponent);
        records.sort((a, b) => a.time_seconds - b.time_seconds);
        return records.slice(0, 100);
    }

    showWinNotification(timeSeconds) {
        const notification = document.createElement('div');
        notification.className = 'win-notification';
        notification.innerHTML = `
            <div class="win-notification-content">
                <span class="win-icon">🏆</span>
                <span>Time recorded: ${this.formatTime(timeSeconds)}</span>
            </div>
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    }
}
