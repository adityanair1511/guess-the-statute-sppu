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
    console.error("Firebase Config Missing:", error);
}

// --- THEME ---
const htmlEl = document.documentElement;
const savedTheme = localStorage.getItem('theme') || 'dark';
htmlEl.setAttribute('data-theme', savedTheme);
document.getElementById('theme-icon').innerText = savedTheme === 'dark' ? '🌙' : '☀️';

function toggleTheme() {
    const newTheme = htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    htmlEl.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    document.getElementById('theme-icon').innerText = newTheme === 'dark' ? '🌙' : '☀️';
}

// --- GAME VARS ---
let score = 0, currentRound = 1, maxRounds = 5; 
let playerName = "Student", selectedSubject = "", selectedSemester = "";
let availableQuestions = [], usedQuestionIds = new Set(), currentLevelData = []; 
let selectedQ = null, selectedA = null, isProcessing = false; 
let mistakes = new Set(), isAppealMode = false;

document.addEventListener('DOMContentLoaded', () => {
    if (typeof GAME_DATA !== 'undefined' && GAME_DATA.length > 0) {
        const subjects = [...new Set(GAME_DATA.map(item => item.subject))].sort();
        const select = document.getElementById('subject-select');
        subjects.forEach(sub => {
            const opt = document.createElement('option'); opt.value = sub; opt.innerText = sub; select.appendChild(opt);
        });
        refreshLeaderboardUI();
    }
});

function updateSemesters() {
    const subj = document.getElementById('subject-select').value;
    const semSelect = document.getElementById('semester-select');
    semSelect.innerHTML = '<option value="" disabled selected>Select Semester</option>';
    semSelect.disabled = true;

    if (subj) {
        let sems = new Set();
        GAME_DATA.forEach(item => { if (item.subject === subj) item.semester.forEach(s => sems.add(s)); });
        const sorted = [...sems].sort();
        if (sorted.length === 0) {
            const opt = document.createElement('option'); opt.innerText = "All Semesters"; opt.value = "ALL"; semSelect.appendChild(opt);
        } else {
            sorted.forEach(s => {
                const opt = document.createElement('option'); opt.value = s; opt.innerText = s; semSelect.appendChild(opt);
            });
        }
        semSelect.disabled = false;
        refreshLeaderboardUI();
    }
}

// --- SECURE LEADERBOARD ---
async function refreshLeaderboardUI() {
    if (!db) return;
    const subj = document.getElementById('subject-select').value;
    const sem = document.getElementById('semester-select').value;
    const title = document.getElementById('leaderboard-title');
    const indicator = document.getElementById('loading-indicator');
    
    title.innerText = subj ? `🏆 Global: ${subj}` : `🏆 Global Scores`;
    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = '';
    indicator.style.display = "inline";

    try {
        const q = db.collection("scores").orderBy("score", "desc").limit(100);
        const snapshot = await q.get();
        let history = snapshot.docs.map(doc => doc.data());

        // Client-side filter
        if (subj) history = history.filter(item => item.subject === subj);
        if (sem && sem !== "ALL") history = history.filter(item => item.semester === sem);

        tbody.innerHTML = history.length ? '' : '<tr><td colspan="4" style="text-align:center; color:#888;">No scores yet.</td></tr>';
        indicator.style.display = "none";

        history.slice(0, 10).forEach((entry, i) => {
            const tr = document.createElement('tr');
            
            // 1. Rank
            const tdRank = document.createElement('td');
            if(i===0) tdRank.textContent = "🥇";
            else if(i===1) tdRank.textContent = "🥈";
            else if(i===2) tdRank.textContent = "🥉";
            else tdRank.textContent = `#${i+1}`;

            // 2. Name (SECURE XSS PREVENTED HERE)
            const tdName = document.createElement('td');
            tdName.textContent = entry.name; // <--- Uses textContent, safe from HTML injection

            // 3. Score
            const tdScore = document.createElement('td');
            tdScore.style.fontWeight = "bold";
            tdScore.textContent = entry.score;

            // 4. Date
            const tdDate = document.createElement('td');
            let d = entry.date;
            if(entry.timestamp) d = new Date(entry.timestamp.seconds * 1000).toLocaleDateString();
            tdDate.textContent = d;
            tdDate.style.fontSize = "0.8rem";
            tdDate.style.color = "var(--text-secondary)";

            tr.append(tdRank, tdName, tdScore, tdDate);
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error(e);
        indicator.style.display = "none";
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Offline mode</td></tr>';
    }
}

// --- GAMEPLAY ---
function startGame() {
    const name = document.getElementById('username').value.trim();
    const subj = document.getElementById('subject-select').value;
    const sem = document.getElementById('semester-select').value;

    if (name === "RESET") {
        if(confirm("⚠ RESET: Wipe personal learning data?")) {
            localStorage.removeItem('lawGameRetention'); location.reload();
        }
        return;
    }
    if (!name || !subj || !sem) { alert("Please fill in all fields!"); return; }

    playerName = name; selectedSubject = subj; selectedSemester = sem;
    
    let raw = (sem === "ALL") ? GAME_DATA.filter(i => i.subject === subj) : GAME_DATA.filter(i => i.subject === subj && i.semester.includes(sem));
    if (raw.length < 5) { alert("Need at least 5 questions."); return; }

    // Smart Sort
    const retention = JSON.parse(localStorage.getItem('lawGameRetention') || '{}');
    const now = Date.now();
    raw.forEach(q => {
        const d = retention[q.id] || { level: 0, nextReview: 0 };
        q.priority = (d.level === 0) ? 100 : (now >= d.nextReview ? 50 + d.level : 1);
        q.priority += Math.random();
    });
    availableQuestions = raw.sort((a, b) => b.priority - a.priority);

    mistakes.clear(); isAppealMode = false; currentRound = 1;
    document.getElementById('start-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    document.getElementById('player-display').innerText = playerName;
    startRound();
}

function startRound() {
    document.getElementById('round-display').innerText = isAppealMode ? "Appeal" : `Round ${currentRound}/${maxRounds}`;
    let pool = [];
    
    if (isAppealMode) {
        pool = GAME_DATA.filter(i => mistakes.has(i.id));
        currentLevelData = pool.sort(() => Math.random() - 0.5);
    } else {
        let fresh = availableQuestions.filter(q => !usedQuestionIds.has(q.id));
        if (fresh.length < 5) { usedQuestionIds.clear(); fresh = availableQuestions; }
        pool = fresh.slice(0, 5);
        pool.forEach(q => usedQuestionIds.add(q.id));
        currentLevelData = pool;
    }
    
    const qCol = document.getElementById('col-questions');
    const aCol = document.getElementById('col-answers');
    qCol.innerHTML = ''; aCol.innerHTML = '';
    
    let qCards = currentLevelData.map(d => ({id: d.id, text: d.question, type: 'q'}));
    let aCards = currentLevelData.map(d => ({id: d.id, text: d.answer, type: 'a'}));
    
    // Shuffle display
    qCards.sort(() => Math.random() - 0.5).forEach((item, i) => createCard(item, qCol, i));
    aCards.sort(() => Math.random() - 0.5).forEach((item, i) => createCard(item, aCol, i));
}

function createCard(item, container, index) {
    const div = document.createElement('div');
    div.className = 'card'; div.textContent = item.text;
    div.dataset.id = item.id; div.dataset.type = item.type;
    div.style.animationDelay = `${index * 0.1}s`;
    div.onclick = () => handleCardClick(div);
    container.appendChild(div);
}

function handleCardClick(card) {
    if (isProcessing || card.classList.contains('matched') || card.classList.contains('selected')) return;
    const type = card.dataset.type;
    const current = type === 'q' ? selectedQ : selectedA;
    if (current) current.classList.remove('selected');
    card.classList.add('selected');
    if (type === 'q') selectedQ = card; else selectedA = card;
    if (selectedQ && selectedA) checkMatch();
}

function checkMatch() {
    const fb = document.getElementById('feedback');
    const id1 = parseInt(selectedQ.dataset.id); const id2 = parseInt(selectedA.dataset.id);

    if (id1 === id2) {
        score += 10; fb.innerText = "Correct! +10"; fb.style.color = "var(--success-color)";
        if (!isAppealMode) updateRetention(id1, true);
        
        selectedQ.classList.add('matched'); selectedA.classList.add('matched');
        selectedQ.classList.remove('selected'); selectedA.classList.remove('selected');
        selectedQ = null; selectedA = null;
        
        if (document.querySelectorAll('.card:not(.matched)').length === 0) setTimeout(nextRound, 800);
    } else {
        isProcessing = true; score = Math.max(0, score - 5);
        fb.innerText = "Wrong! -5"; fb.style.color = "var(--error-color)";
        selectedQ.classList.add('shake'); selectedA.classList.add('shake');
        
        if (!isAppealMode) updateRetention(id1, false);
        mistakes.add(id1); mistakes.add(id2); // Track both sides
        
        setTimeout(() => {
            if(selectedQ) selectedQ.classList.remove('selected', 'shake');
            if(selectedA) selectedA.classList.remove('selected', 'shake');
            selectedQ = null; selectedA = null; fb.innerText = ""; isProcessing = false;
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
    if (isAppealMode) {
        document.getElementById('end-title').innerText = "Appeal Complete";
        document.getElementById('end-message').innerText = "Review finished.";
        appealBtn.style.display = 'none';
    } else {
        if (mistakes.size > 0) {
            document.getElementById('end-title').innerText = "Session Adjourned";
            document.getElementById('end-message').innerText = `${mistakes.size} items to review.`;
            appealBtn.style.display = 'inline-block';
        } else {
            document.getElementById('end-title').innerText = "Perfect Session!";
            appealBtn.style.display = 'none';
        }
        if (db) saveScoreToCloud();
    }
}

function startAppealMode() {
    isAppealMode = true;
    document.getElementById('end-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    startRound();
}

function updateRetention(id, success) {
    const data = JSON.parse(localStorage.getItem('lawGameRetention') || '{}');
    const entry = data[id] || { level: 0, nextReview: 0 };
    if (success) {
        entry.level++;
        entry.nextReview = Date.now() + (Math.ceil(Math.pow(2, entry.level)) * 86400000);
    } else {
        entry.level = 0; entry.nextReview = 0;
    }
    data[id] = entry;
    localStorage.setItem('lawGameRetention', JSON.stringify(data));
}

function saveScoreToCloud() {
    const stat = document.getElementById('upload-status');
    stat.innerText = "Saving...";
    db.collection("scores").add({
        name: playerName, score: score, subject: selectedSubject, semester: selectedSemester,
        date: new Date().toLocaleDateString(), timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => stat.innerText = "Saved to Cloud ✓").catch(e => { console.error(e); stat.innerText = "Save Error"; });
}

function resetAllProgress() {
    if(confirm("Reset personal study data?")) {
        localStorage.removeItem('lawGameRetention'); location.reload();
    }
}
