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

/* ─── NotebookLM 風格來源管理 ─── */
const sourceTitleInput = document.getElementById("source-title");
const sourceContentInput = document.getElementById("source-content");
const addSourceBtn = document.getElementById("add-source-btn");
const loadSampleBtn = document.getElementById("load-sample-btn");
const sourceList = document.getElementById("source-list");
const sourceCount = document.getElementById("source-count");
const summaryText = document.getElementById("summary-text");
const topicList = document.getElementById("topic-list");
const questionList = document.getElementById("question-list");
const refreshSummaryBtn = document.getElementById("refresh-summary-btn");
const refreshQuestionsBtn = document.getElementById("refresh-questions-btn");

const sources = [];
let sourceIdSeed = 0;

const stopWords = new Set([
  "我們",
  "你們",
  "他們",
  "這個",
  "這些",
  "目前",
  "以及",
  "可以",
  "如果",
  "因此",
  "另外",
  "透過",
  "系統",
  "方案",
  "產品",
  "規劃",
  "內容",
  "this",
  "that",
  "with",
  "from",
  "have",
  "will",
  "your",
]);

function updateSourceCount() {
  sourceCount.textContent = `${sources.length} 份`;
}

function renderSourceList() {
  sourceList.innerHTML = "";
  if (sources.length === 0) {
    const empty = document.createElement("p");
    empty.className = "insight-empty";
    empty.textContent = "尚未新增內容。可貼上文件、企劃、FAQ 等文字資料。";
    sourceList.appendChild(empty);
    updateSourceCount();
    return;
  }

  sources.forEach((source) => {
    const card = document.createElement("div");
    card.className = "source-card";
    const title = document.createElement("h4");
    title.textContent = source.title;
    const snippet = document.createElement("p");
    snippet.className = "insight-empty";
    snippet.textContent = source.content.slice(0, 120) + (source.content.length > 120 ? "…" : "");
    const meta = document.createElement("div");
    meta.className = "source-meta";
    meta.textContent = `${source.originLabel} · ${source.wordCount} 字`;
    card.appendChild(title);
    card.appendChild(snippet);
    card.appendChild(meta);
    sourceList.appendChild(card);
  });

  updateSourceCount();
}

function upsertSource({ id, title, content, originLabel }) {
  const wordCount = content.replace(/\s+/g, "").length;
  const existingIndex = sources.findIndex((item) => item.id === id);
  const payload = {
    id,
    title,
    content,
    wordCount,
    originLabel,
    createdAt: new Date().toLocaleString("zh-Hant", {
      hour12: false,
    }),
  };

  if (existingIndex === -1) {
    sources.unshift(payload);
  } else {
    sources[existingIndex] = payload;
  }

  renderSourceList();
  refreshInsights();
}

function addSourceFromInput() {
  const title = sourceTitleInput.value.trim() || `自訂來源 ${sources.length + 1}`;
  const content = sourceContentInput.value.trim();
  if (!content) return;

  sourceIdSeed += 1;
  upsertSource({
    id: `manual-${sourceIdSeed}`,
    title,
    content,
    originLabel: "手動貼入",
  });

  sourceTitleInput.value = "";
  sourceContentInput.value = "";
}

function loadSampleSources() {
  const samples = [
    {
      title: "產品簡報：OmniPlay AI 3.0",
      content:
        "OmniPlay AI 3.0 將焦點放在多文件筆記整理與決策支援。核心功能包含：多來源上傳、引用式回覆、快速摘要與建議問題產生。目標客群為企業知識管理與客服團隊，期望在 2024 Q4 上線 beta。",
    },
    {
      title: "會議紀要：客服流程優化",
      content:
        "團隊決議將 FAQ 來源整合到同一套知識庫，並在對話中標示引用來源。KPI 包含平均回覆時間降低 25%、新進人員培訓時間縮短 40%。需新增『快速提問模板』與『重點摘要』區塊。",
    },
  ];

  samples.forEach((sample) => {
    sourceIdSeed += 1;
    upsertSource({
      id: `sample-${sourceIdSeed}`,
      title: sample.title,
      content: sample.content,
      originLabel: "範例來源",
    });
  });
}

function extractKeywords(text) {
  const tokens = text.match(/[\u4e00-\u9fa5]{2,6}|[A-Za-z]{3,}/g) || [];
  const counts = new Map();

  tokens.forEach((token) => {
    const normalized = token.toLowerCase();
    if (stopWords.has(normalized)) return;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word]) => word);
}

function generateSummary() {
  if (sources.length === 0) return "尚未有內容。";
  return sources
    .slice(0, 3)
    .map((source) => `${source.title}：${source.content.slice(0, 80)}…`)
    .join("\n");
}

function generateTopics() {
  if (sources.length === 0) return [];
  const combined = sources.map((source) => source.content).join(" ");
  return extractKeywords(combined);
}

function generateQuestions(topics) {
  if (topics.length === 0) return [];
  const templates = [
    (topic) => `關於「${topic}」的核心重點是什麼？`,
    (topic) => `有哪些應用情境需要注意「${topic}」？`,
    (topic) => `「${topic}」下一步行動建議？`,
  ];
  const questions = [];
  topics.forEach((topic, index) => {
    const template = templates[index % templates.length];
    questions.push(template(topic));
  });
  return questions.slice(0, 5);
}

function refreshInsights() {
  summaryText.textContent = generateSummary();

  const topics = generateTopics();
  topicList.innerHTML = "";
  if (topics.length === 0) {
    const empty = document.createElement("li");
    empty.className = "insight-empty";
    empty.textContent = "尚未有主題。";
    topicList.appendChild(empty);
  } else {
    topics.forEach((topic) => {
      const li = document.createElement("li");
      li.textContent = topic;
      topicList.appendChild(li);
    });
  }

  const questions = generateQuestions(topics);
  questionList.innerHTML = "";
  if (questions.length === 0) {
    const empty = document.createElement("span");
    empty.className = "insight-empty";
    empty.textContent = "加入來源後會自動生成提問。";
    questionList.appendChild(empty);
  } else {
    questions.forEach((question) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = question;
      btn.addEventListener("click", () => {
        userInput.value = question;
        userInput.focus();
      });
      questionList.appendChild(btn);
    });
  }
}

const sheetsUrlInput   = document.getElementById("sheets-url");
const sheetsConnectBtn = document.getElementById("sheets-connect-btn");
const sheetsStatus     = document.getElementById("sheets-status");
const sheetsPreview    = document.getElementById("sheets-preview");
 
/**
 * 從 Google Sheets 共用連結中提取 Spreadsheet ID。
 */
function parseSpreadsheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([^/]+)/);
  return match ? match[1] : null;
}

  /**
 * 從 Google Sheets 共用連結中提取 gid。
 */
function parseSheetGid(url) {
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  return gidMatch ? gidMatch[1] : null;
}

/**
 * 解析輸入：既可放單一分頁連結，也可放整份試算表連結。
 */
function parseSheetSources(raw) {
  const candidates = raw
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);

  const csvUrls = new Set();
  const spreadsheetIds = new Set();

  candidates.forEach((value) => {
    const id = parseSpreadsheetId(value);
    if (!id) return;
    const gid = parseSheetGid(value);
    if (gid) {
      csvUrls.add(
        `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`
      );
    } else {
      spreadsheetIds.add(id);
    }
  });

  return {
    csvUrls: Array.from(csvUrls),
    spreadsheetIds: Array.from(spreadsheetIds),
  };
}

async function fetchWorksheetGids(spreadsheetId) {
  const feedUrl = `https://spreadsheets.google.com/feeds/worksheets/${spreadsheetId}/public/basic?alt=json`;
  const res = await fetch(feedUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const entries = json?.feed?.entry || [];
  if (entries.length === 0) throw new Error("找不到任何分頁");

  const gids = entries
    .map((entry) => {
      const idText = entry?.id?.$t || "";
      const gid = idText.split("/").pop();
      return gid;
    })
    .filter(Boolean);

   if (gids.length === 0) throw new Error("分頁資訊解析失敗");
   return gids;
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
async function fetchSheetData(csvUrls, spreadsheetIds) {
  setStatus(false, "拉取中…");
  sheetsConnectBtn.disabled = true;

  try {
    const allCsvUrls = new Set(csvUrls);

    if (spreadsheetIds.length > 0) {
      const gidMaps = await Promise.all(
        spreadsheetIds.map(async (id) => {
          try {
            const gids = await fetchWorksheetGids(id);
            return { id, gids };
          } catch (err) {
            throw new Error(
              `無法取得試算表分頁清單，請確認已設為公開或已發布：${err.message}`
            );
          }
        })
      );

      gidMaps.forEach(({ id, gids }) => {
        gids.forEach((gid) => {
          allCsvUrls.add(
            `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`
          );
        });
      });
    }

    const finalCsvUrls = Array.from(allCsvUrls);
    if (finalCsvUrls.length === 0) throw new Error("沒有可拉取的工作表連結");

    const results = await Promise.allSettled(
      finalCsvUrls.map(async (csvUrl) => {
        const res = await fetch(csvUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const data = parseCsv(text);
        if (data.length < 2) throw new Error("工作表無數據行");
        return data;
      })
    );

    const successfulSheets = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    if (successfulSheets.length === 0) {
      throw new Error("無法讀取任何工作表");
    }

    const combined = [];
    let header = null;

    successfulSheets.forEach((sheetData) => {
      if (!header) {
        header = sheetData[0];
        combined.push(header);
      }
      combined.push(...sheetData.slice(1));
    });

    if (combined.length < 2) throw new Error("工作表無數據行");

    sheetsKnowledgeBase = combined;
    renderPreview(combined);
    const rowCount = combined.length - 1;
    setStatus(true, `已連線（共 ${rowCount} 筆資料 / ${successfulSheets.length} 個工作表）`);

   const sheetText = combined
      .slice(1, 21)
      .map((row) =>
        row
          .map((cell, index) => `${combined[0][index] || "欄位"}：${cell}`)
          .join(" | ")
      )
      .join("\n");
    upsertSource({
      id: "google-sheets",
      title: "Google Sheets 知識庫",
      content: sheetText,
      originLabel: "Sheets 匯入",
    });
   
    // 啟動 15 分鐘自動刷新
    if (sheetsRefreshTimer) clearInterval(sheetsRefreshTimer);
      sheetsRefreshTimer = setInterval(
      () => fetchSheetData(finalCsvUrls, spreadsheetIds),
      15 * 60 * 1000
    );
  } catch (err) {
    const message = err.message.startsWith("HTTP 400")
      ? "連接失敗：請確認已設為「知道連結的任何人可檢視」後再試。"
      : "連接失敗：" + err.message;
    setStatus(false, message);
    sheetsPreview.style.display = "none";
  } finally {
    sheetsConnectBtn.disabled = false;
  }
}
 
sheetsConnectBtn.addEventListener("click", () => {
  const raw = sheetsUrlInput.value.trim();
  if (!raw) { setStatus(false, "請輸入連結"); return; }

  const sources = parseSheetSources(raw);
  if (sources.csvUrls.length === 0 && sources.spreadsheetIds.length === 0) {
    setStatus(false, "連結格式無效");
    return;
  }

  fetchSheetData(sources.csvUrls, sources.spreadsheetIds);
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
 if (sources.length === 0) return null;

  const keywords = question
    .toLowerCase()
    .split(/[\s,，。、？?！!]+/)
    .filter(Boolean);
  if (keywords.length === 0) return null;

  const scored = sources
    .map((source) => {
      const text = source.content.toLowerCase();
      const score = keywords.reduce((acc, keyword) => (text.includes(keyword) ? acc + 1 : acc), 0);
      return { source, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  if (scored.length === 0) return null;

  const answer = scored
    .map(({ source }) => `${source.title}：${source.content.slice(0, 140)}…`)
    .join("\n\n");

  return {
    answer,
    citations: scored.map(({ source }) => source.title),
  };
}
 
function appendMessage(role, text, citations = []) {
  const div = document.createElement("div");
  div.className = "message " + role;
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  div.appendChild(paragraph);

  if (role === "ai" && citations.length > 0) {
    const citationBox = document.createElement("div");
    citationBox.className = "citations";
    citations.forEach((item) => {
      const pill = document.createElement("span");
      pill.className = "citation-pill";
      pill.textContent = item;
      citationBox.appendChild(pill);
    });
    div.appendChild(citationBox);
  }
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
  if (sources.length === 0) {
      appendMessage("ai", "目前尚未加入任何來源。請先在左側新增文件內容或載入範例來源。");
      return;
    }
 
    const result = searchKnowledge(q);
    if (result) {
      appendMessage("ai", "根據來源整理的重點如下：\n\n" + result.answer, result.citations);
    } else {
      appendMessage("ai", "抱歉，在目前的來源中未找到明確線索。您可以換個關鍵詞或補充更多內容。");
    }
  }, 600);
}
 
sendBtn.addEventListener("click", handleSend);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
});

addSourceBtn.addEventListener("click", addSourceFromInput);
loadSampleBtn.addEventListener("click", loadSampleSources);
refreshSummaryBtn.addEventListener("click", refreshInsights);
refreshQuestionsBtn.addEventListener("click", refreshInsights);

refreshInsights();
