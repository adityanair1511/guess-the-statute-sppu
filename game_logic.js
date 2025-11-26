// --- 1. FIREBASE CONFIGURATION (PASTE YOUR KEYS HERE) ---
const firebaseConfig = {
  apiKey: "AIzaSyAM4MEVdkmymiHyI9XAPTcufLmcdrmvfas",
  authDomain: "lawmastery-41c24.firebaseapp.com",
  projectId: "lawmastery-41c24",
  storageBucket: "lawmastery-41c24.firebasestorage.app",
  messagingSenderId: "433320278268",
  appId: "1:433320278268:web:581541b6731024d4b53f79"
};

// Initialize Firebase
let db;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("🔥 Firebase Connected");
} catch (error) {
    console.error("Firebase Error. Check Config:", error);
    alert("Warning: Database not connected. Check console.");
}

// --- THEME MANAGEMENT ---
const htmlEl = document.documentElement;
const themeIcon = document.getElementById('theme-icon');
const savedTheme = localStorage.getItem('theme') || 'dark';
htmlEl.setAttribute('data-theme', savedTheme);
updateThemeIcon(savedTheme);

function toggleTheme() {
    const currentTheme = htmlEl.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    htmlEl.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}
function updateThemeIcon(theme) { themeIcon.innerText = theme === 'dark' ? '🌙' : '☀️'; }


// --- GAME LOGIC ---
let score = 0;
let currentRound = 1;
let maxRounds = 5; 
let selectedSubject = "";
let selectedSemester = "";
let playerName = "Student";
let availableQuestions = [];
let usedQuestionIds = new Set(); 
let currentLevelData = []; 
let selectedQ = null; let selectedA = null;
let isProcessing = false; 
let mistakes = new Set(); 
let isAppealMode = false;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    if (typeof GAME_DATA !== 'undefined' && GAME_DATA.length > 0) {
        const subjects = [...new Set(GAME_DATA.map(item => item.subject))].sort();
        const select = document.getElementById('subject-select');
        subjects.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub; opt.innerText = sub; select.appendChild(opt);
        });
        
        // Initial load of global scores
        refreshLeaderboardUI();
    } else {
        alert("Game data not found! Run the Python script first.");
    }
});

function updateSemesters() {
    const subj = document.getElementById('subject-select').value;
    const semSelect = document.getElementById('semester-select');
    semSelect.innerHTML = '<option value="" disabled selected>Select Semester</option>';
    semSelect.disabled = true;

    if (subj) {
        let sems = new Set();
        GAME_DATA.forEach(item => {
            if (item.subject === subj) item.semester.forEach(s => sems.add(s));
        });
        
        const sortedSems = [...sems].sort();
        if (sortedSems.length === 0) {
            const opt = document.createElement('option'); opt.innerText = "All Semesters"; opt.value = "ALL"; semSelect.appendChild(opt);
        } else {
            sortedSems.forEach(s => {
                const opt = document.createElement('option'); opt.value = s; opt.innerText = s; semSelect.appendChild(opt);
            });
        }
        semSelect.disabled = false;
        refreshLeaderboardUI();
    }
}

// --- CLOUD LEADERBOARD LOGIC ---
async function refreshLeaderboardUI() {
    const subj = document.getElementById('subject-select').value;
    const sem = document.getElementById('semester-select').value;
    const title = document.getElementById('leaderboard-title');
    const indicator = document.getElementById('loading-indicator');
    
    if (subj) title.innerText = `🏆 Global Scores: ${subj}`;
    else title.innerText = `🏆 Global Scores`;

    // Fetch from Firebase
    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading cloud data...</td></tr>';
    indicator.style.display = "inline";

    try {
        // Query: Get Top 50 scores globally, then filter in JS to avoid complex index requirements
        // (Simpler for setup)
        const q = db.collection("scores").orderBy("score", "desc").limit(100);
        const querySnapshot = await q.get();
        
        let history = [];
        querySnapshot.forEach((doc) => {
            history.push(doc.data());
        });

        // Filter Client Side
        if (subj) history = history.filter(item => item.subject === subj);
        if (sem && sem !== "ALL") history = history.filter(item => item.semester === sem);

        tbody.innerHTML = history.length ? '' : '<tr><td colspan="4" style="text-align:center; color: var(--text-secondary);">No scores yet. Be the first!</td></tr>';
        indicator.style.display = "none";

        history.slice(0, 10).forEach((entry, i) => {
            const tr = document.createElement('tr');
            let rank = `#${i+1}`;
            if(i===0) rank = "🥇"; if(i===1) rank = "🥈"; if(i===2) rank = "🥉";
            
            // Format Date safely
            let dateStr = entry.date;
            if(entry.timestamp) dateStr = new Date(entry.timestamp.seconds * 1000).toLocaleDateString();

            tr.innerHTML = `<td>${rank}</td><td>${entry.name}</td><td style="font-weight:bold;">${entry.score}</td><td style="font-size:0.8rem; color: var(--text-secondary);">${dateStr}</td>`;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error("Error fetching scores: ", e);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--error-color);">Could not connect to Cloud Database.</td></tr>';
    }
}

// --- GAME LOGIC (START & PLAY) ---
function startGame() {
    const nameInput = document.getElementById('username').value.trim();
    const subInput = document.getElementById('subject-select').value;
    const semInput = document.getElementById('semester-select').value;

    if (nameInput === "RESET") {
        if(confirm("⚠ RESET PERSONAL DATA: This will clear your Spaced Repetition progress?")) {
            localStorage.removeItem('lawGameRetention');
            alert("Personal Study Data Cleared.");
            location.reload();
        }
        return;
    }

    if (!nameInput) { alert("Please enter your name!"); return; }
    if (!subInput) { alert("Please select a subject!"); return; }
    if (!semInput) { alert("Please select a semester!"); return; }

    playerName = nameInput;
    selectedSubject = subInput;
    selectedSemester = semInput;
    
    // 1. FILTER
    let rawQuestions = [];
    if (selectedSemester === "ALL") {
        rawQuestions = GAME_DATA.filter(item => item.subject === selectedSubject);
    } else {
        rawQuestions = GAME_DATA.filter(item => item.subject === selectedSubject && item.semester.includes(selectedSemester));
    }

    if (rawQuestions.length < 5) { alert(`Not enough questions found (${rawQuestions.length}). Need 5.`); return; }

    // 2. SMART SORTING (Local Spaced Repetition)
    const retention = getRetentionData();
    const now = new Date().getTime();
    rawQuestions.forEach(q => {
        const data = retention[q.id] || { level: 0, nextReview: 0 };
        if (data.level === 0) q.priority = 100;
        else if (now >= data.nextReview) q.priority = 50 + data.level;
        else q.priority = 1;
        q.priority += Math.random();
    });
    availableQuestions = rawQuestions.sort((a, b) => b.priority - a.priority);

    mistakes.clear(); isAppealMode = false; currentRound = 1;

    document.getElementById('start-screen').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
        document.getElementById('player-display').innerText = playerName;
        startRound();
    }, 300);
}

function startRound() {
    let displayRound = isAppealMode ? "Appeal" : `${currentRound} / ${maxRounds}`;
    document.getElementById('round-display').innerText = `Round ${displayRound}`;
    
    let roundPool = [];
    if (isAppealMode) {
        roundPool = GAME_DATA.filter(item => mistakes.has(item.id));
        currentLevelData = shuffle(roundPool);
    } else {
        let freshQuestions = availableQuestions.filter(q => !usedQuestionIds.has(q.id));
        if (freshQuestions.length < 5) { usedQuestionIds.clear(); freshQuestions = availableQuestions; }
        roundPool = freshQuestions.slice(0, 5);
        roundPool.forEach(q => usedQuestionIds.add(q.id));
        currentLevelData = roundPool; 
    }
    renderBoard();
}

function renderBoard() {
    const qCol = document.getElementById('col-questions'); const aCol = document.getElementById('col-answers');
    qCol.innerHTML = ''; aCol.innerHTML = '';
    let questions = currentLevelData.map(d => ({ id: d.id, text: d.question, type: 'q' }));
    let answers = currentLevelData.map(d => ({ id: d.id, text: d.answer, type: 'a' }));
    shuffle(questions).forEach((q, index) => createCard(q, qCol, index));
    shuffle(answers).forEach((a, index) => createCard(a, aCol, index));
}

function createCard(item, container, index) {
    const div = document.createElement('div'); div.className = 'card'; div.textContent = item.text;
    div.dataset.id = item.id; div.dataset.type = item.type; div.style.animationDelay = `${index * 0.1}s`; 
    div.onclick = () => handleCardClick(div); container.appendChild(div);
}

function handleCardClick(card) {
    if (isProcessing) return; 
    if (card.classList.contains('matched') || card.classList.contains('selected')) return;
    const type = card.dataset.type;
    const currentSelected = type === 'q' ? selectedQ : selectedA;
    if (currentSelected) currentSelected.classList.remove('selected');
    card.classList.add('selected');
    if (type === 'q') selectedQ = card; else selectedA = card;
    if (selectedQ && selectedA) checkMatch();
}

function checkMatch() {
    const feedback = document.getElementById('feedback');
    const id1 = parseInt(selectedQ.dataset.id); const id2 = parseInt(selectedA.dataset.id);
    
    if (id1 === id2) {
        score += 10; feedback.innerText = "Excellent! +10"; feedback.style.color = "var(--success-color)";
        if (!isAppealMode) updateRetention(id1, true);
        selectedQ.classList.add('matched'); selectedA.classList.add('matched');
        selectedQ.classList.remove('selected'); selectedA.classList.remove('selected');
        selectedQ = null; selectedA = null;
        if (document.querySelectorAll('.card:not(.matched)').length === 0) setTimeout(nextRound, 800);
    } else {
        isProcessing = true; score = Math.max(0, score - 5);
        feedback.innerText = "Try again! -5"; feedback.style.color = "var(--error-color)";
        selectedQ.classList.add('shake'); selectedA.classList.add('shake');
        if (!isAppealMode) updateRetention(parseInt(selectedQ.dataset.id), false);
        mistakes.add(parseInt(selectedQ.dataset.id)); mistakes.add(parseInt(selectedA.dataset.id));
        setTimeout(() => {
            if(selectedQ) selectedQ.classList.remove('selected', 'shake');
            if(selectedA) selectedA.classList.remove('selected', 'shake');
            selectedQ = null; selectedA = null; feedback.innerText = ""; isProcessing = false; 
        }, 600);
    }
    document.getElementById('score').innerText = score;
}

function nextRound() {
    if (isAppealMode) endGame();
    else if (currentRound < maxRounds) { currentRound++; startRound(); } 
    else endGame();
}

function endGame() {
    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('end-screen').classList.add('active');
    document.getElementById('final-score').innerText = score;

    const appealBtn = document.getElementById('appeal-btn');
    const endTitle = document.getElementById('end-title');
    const endMsg = document.getElementById('end-message');

    if (isAppealMode) {
        endTitle.innerText = "Appeal Adjourned"; endMsg.innerText = "You have reviewed your case files.";
        appealBtn.style.display = 'none'; 
    } else {
        if (mistakes.size > 0) {
            endTitle.innerText = "Session Adjourned"; endMsg.innerText = `You have ${mistakes.size} case files pending review.`;
            appealBtn.style.display = 'inline-block'; appealBtn.innerText = `File an Appeal (${mistakes.size} Mistakes)`;
        } else {
            endTitle.innerText = "Perfect Record!"; endMsg.innerText = "No mistakes found. Court is dismissed.";
            appealBtn.style.display = 'none';
        }
        // SAVE SCORE TO FIREBASE ON GAME COMPLETION
        saveScoreToCloud(); 
    }
}

function startAppealMode() {
    isAppealMode = true;
    document.getElementById('end-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    startRound();
}

// --- DATA UTILITIES ---

function getRetentionData() { return JSON.parse(localStorage.getItem('lawGameRetention') || '{}'); }
function saveRetentionData(data) { localStorage.setItem('lawGameRetention', JSON.stringify(data)); }

function updateRetention(questionId, isCorrect) {
    const data = getRetentionData();
    const entry = data[questionId] || { level: 0, nextReview: 0 };
    if (isCorrect) {
        entry.level += 1;
        const daysToAdd = Math.ceil(Math.pow(2, entry.level)); 
        const nextDate = new Date(); nextDate.setDate(nextDate.getDate() + daysToAdd);
        entry.nextReview = nextDate.getTime();
    } else { entry.level = 0; entry.nextReview = 0; }
    data[questionId] = entry;
    saveRetentionData(data);
}

function resetAllProgress() {
    if(confirm("Are you sure? This will reset all your personal Spaced Repetition learning progress.")) {
        localStorage.removeItem('lawGameRetention'); alert("Progress reset."); location.reload();
    }
}

// --- FIREBASE SAVE ---
function saveScoreToCloud() {
    document.getElementById('upload-status').innerText = "Saving to cloud...";
    
    db.collection("scores").add({
        name: playerName,
        score: score,
        subject: selectedSubject,
        semester: selectedSemester,
        date: new Date().toLocaleDateString(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then((docRef) => {
        console.log("Score written with ID: ", docRef.id);
        document.getElementById('upload-status').innerText = "Saved to Cloud ✓";
    })
    .catch((error) => {
        console.error("Error adding score: ", error);
        document.getElementById('upload-status').innerText = "Error Saving (Offline?)";
    });
}

function shuffle(array) { return array.sort(() => Math.random() - 0.5); }