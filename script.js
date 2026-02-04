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
