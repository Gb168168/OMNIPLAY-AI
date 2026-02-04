/* ─── 導航切頁 ─── */
const navLinks = document.querySelectorAll(".nav-link[data-target]");
const sections = document.querySelectorAll(".content-section");
const pageTitle = document.getElementById("page-title");
 
const sectionTitles = {
  "ai-feature": "AI 智能對答",
  "database-sync": "資料庫連動中心",
  settings: "系統整合設定",
};
 
const setActiveSection = (targetId) => {
  sections.forEach((section) => {
    section.classList.toggle("active", section.id === targetId);
  });
 
  navLinks.forEach((link) => {
    const isActive = link.dataset.target === targetId;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
 
  if (pageTitle && sectionTitles[targetId]) {
    pageTitle.textContent = sectionTitles[targetId];
  }
};
 
navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const targetId = link.dataset.target;
    if (!targetId) return;
    setActiveSection(targetId);
  });
});
 
const initialTarget = document.querySelector(".nav-link.active")?.dataset.target;
if (initialTarget) {
  setActiveSection(initialTarget);
}
 
/* ─── Google Sheets 整合 ─── */
let sheetsKnowledgeBase = [];   // 儲存拉取到的二維陣列（第一筆為標題行）
let sheetsRefreshTimer = null;  // 自動更新計時器
 
const sheetsUrlInput   = document.getElementById("sheets-url");
const sheetsConnectBtn = document.getElementById("sheets-connect-btn");
const sheetsStatus     = document.getElementById("sheets-status");
const sheetsPreview    = document.getElementById("sheets-preview");
 
/**
 * 從 Google Sheets 共用連結中提取 Spreadsheet ID 與 gid。
 * 支援格式：
 *   /d/{ID}/edit…       → export?format=csv
 *   /d/{ID}/pub?…       → 直接用 export
 */
function parseSheetUrl(url) {
  const match = url.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match) return null;
 
  const id = match[1];
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
 
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}
 
/**
 * 簡單 CSV → 二維陣列解析。
 * 處理欄位內含逗號、換行、雙引號等情況。
 */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
 
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
 
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(field.trim()); field = ""; }
      else if (ch === '\n') { row.push(field.trim()); rows.push(row); row = []; field = ""; }
      else if (ch === '\r') { /* skip */ }
      else { field += ch; }
    }
  }
  // 最後一筆
  row.push(field.trim());
  if (row.some((c) => c !== "")) rows.push(row);
 
  return rows;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
 
/**
 * 將二維陣列渲染為預覽表格。
 */
function renderPreview(data) {
  if (data.length === 0) return;
 
  const headers = data[0];
  const colCount = headers.length;
  // 限制顯示前 5 欄
  const showCols = Math.min(colCount, 5);
 
  let html = '<table><thead><tr>';
  for (let c = 0; c < showCols; c++) {
    html += `<th>${escapeHtml(headers[c] || "")}</th>`;
  }
  html += '</tr></thead><tbody>';
 
  // 限制預覽前 8 筆數據行
  const rowLimit = Math.min(data.length, 9);
  for (let r = 1; r < rowLimit; r++) {
    html += '<tr>';
    for (let c = 0; c < showCols; c++) {
      html += `<td>${escapeHtml((data[r] && data[r][c]) || "")}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  html += `<div class="sheet-row-count">共 ${data.length - 1} 筆資料</div>`;
 
  sheetsPreview.innerHTML = html;
  sheetsPreview.style.display = "block";
}
 
/**
 * 更新連線狀態標記。
 */
function setStatus(connected, message) {
  if (connected) {
    sheetsStatus.className = "status-badge";
    sheetsStatus.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
  } else {
    sheetsStatus.className = "status-badge disconnected";
    sheetsStatus.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
  }
}
 
/**
 * 核心：拉取並更新知識庫。
 */
async function fetchSheetData(csvUrl) {
  setStatus(false, "拉取中…");
  sheetsConnectBtn.disabled = true;
 
  try {
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
 
    const text = await res.text();
    const data = parseCsv(text);
 
    if (data.length < 2) throw new Error("工作表無數據行");
 
    sheetsKnowledgeBase = data;
    renderPreview(data);
    setStatus(true, `已連線（${data.length - 1} 筆資料）`);
 
    // 啟動 15 分鐘自動刷新
    if (sheetsRefreshTimer) clearInterval(sheetsRefreshTimer);
    sheetsRefreshTimer = setInterval(() => fetchSheetData(csvUrl), 15 * 60 * 1000);
  } catch (err) {
    setStatus(false, "連接失敗：" + err.message);
    sheetsPreview.style.display = "none";
  } finally {
    sheetsConnectBtn.disabled = false;
  }
}
 
sheetsConnectBtn.addEventListener("click", () => {
  const raw = sheetsUrlInput.value.trim();
  if (!raw) { setStatus(false, "請輸入連結"); return; }
 
  const csvUrl = parseSheetUrl(raw);
  if (!csvUrl) { setStatus(false, "連結格式無效"); return; }
 
  fetchSheetData(csvUrl);
});
 
/* ─── AI 對答（從 Google Sheets 知識庫搜索） ─── */
const chatMessages = document.getElementById("chat-messages");
const userInput     = document.getElementById("user-input");
const sendBtn       = document.querySelector(".send-btn");
 
/**
 * 在知識庫中搜索與問題最相關的一筆記錄。
 * 策略：將使用者問題分解為詞，計算每筆記錄中命中詞數，取最高者。
 */
function searchKnowledge(question) {
  if (sheetsKnowledgeBase.length < 2) return null;
 
  const headers = sheetsKnowledgeBase[0];
  const words = question.toLowerCase().split(/[\s,，。、？?！!]+/).filter(Boolean);
  if (words.length === 0) return null;
 
  let bestScore = 0, bestRow = null;
 
  for (let r = 1; r < sheetsKnowledgeBase.length; r++) {
    const rowText = sheetsKnowledgeBase[r].join(" ").toLowerCase();
    let score = 0;
    for (const w of words) {
      if (rowText.includes(w)) score++;
    }
    if (score > bestScore) { bestScore = score; bestRow = r; }
  }
 
  if (bestScore === 0) return null;
 
  // 將匹配行以「欄位名：值」方式組合回答
  const row = sheetsKnowledgeBase[bestRow];
  const parts = headers.map((h, i) => (row[i] ? `${h}：${row[i]}` : "")).filter(Boolean);
  return parts.join("\n");
}
 
function appendMessage(role, text) {
  const div = document.createElement("div");
  div.className = "message " + role;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
 
function handleSend() {
  const q = userInput.value.trim();
  if (!q) return;
 
  appendMessage("user", q);
  userInput.value = "";
 
  // 簡短延遲模擬處理
  setTimeout(() => {
    if (sheetsKnowledgeBase.length < 2) {
      appendMessage("ai", "目前尚未連動 Google Sheets 資料。請先在「連動資料庫」頁面貼入您的工作表連結並連接。");
      return;
    }
 
    const answer = searchKnowledge(q);
    if (answer) {
      appendMessage("ai", "根據您的資料庫找到以下參考：\n\n" + answer);
    } else {
      appendMessage("ai", "抱歉，在目前的知識庫中未找到與您問題相關的內容。請試試其他關鍵詞。");
    }
  }, 600);
}
 
sendBtn.addEventListener("click", handleSend);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
});

const navLinks = document.querySelectorAll(".nav-link[data-target]");
const sections = document.querySelectorAll(".content-section");
const pageTitle = document.getElementById("page-title");

const sectionTitles = {
  "ai-feature": "AI 智能對答",
  "database-sync": "資料庫連動中心",
  settings: "系統整合設定",
};

const setActiveSection = (targetId) => {
  sections.forEach((section) => {
    section.classList.toggle("active", section.id === targetId);
  });

  navLinks.forEach((link) => {
    const isActive = link.dataset.target === targetId;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  if (pageTitle && sectionTitles[targetId]) {
    pageTitle.textContent = sectionTitles[targetId];
  }
};

navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const targetId = link.dataset.target;
    if (!targetId) {
      return;
    }
    setActiveSection(targetId);
  });
});

const initialTarget = document.querySelector(".nav-link.active")?.dataset.target;
if (initialTarget) {
  setActiveSection(initialTarget);
}
