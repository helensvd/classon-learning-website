// Mobile nav toggle
document.addEventListener("DOMContentLoaded", function () {
  var navToggle = document.querySelector(".nav-toggle");
  var mainNav = document.querySelector(".main-nav");
  if (navToggle && mainNav) {
    navToggle.addEventListener("click", function () {
      mainNav.classList.toggle("open");
    });
  }

  // Language toggle (EN / ES) using html[data-lang]
  var langButtons = document.querySelectorAll(".lang-toggle button");
  var storedLang = localStorage.getItem("classon-lang") || "en";
  setLang(storedLang);

  langButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setLang(btn.getAttribute("data-lang"));
    });
  });

  function setLang(lang) {
    document.documentElement.setAttribute("data-lang", lang);
    langButtons.forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-lang") === lang);
    });
    try { localStorage.setItem("classon-lang", lang); } catch (e) {}
  }

  // Product filter bar (products page)
  var filterButtons = document.querySelectorAll(".filter-bar button");
  var kitCards = document.querySelectorAll(".kit-card");
  if (filterButtons.length && kitCards.length) {
    filterButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        filterButtons.forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        var category = btn.getAttribute("data-filter");
        kitCards.forEach(function (card) {
          var match = category === "all" || card.getAttribute("data-category") === category;
          card.style.display = match ? "flex" : "none";
        });
      });
    });
  }

  // Contact / quote form — front-end only confirmation (no backend wired up yet)
  var quoteForm = document.getElementById("quote-form");
  var confirmBox = document.getElementById("form-confirm");
  if (quoteForm && confirmBox) {
    quoteForm.addEventListener("submit", function (e) {
      e.preventDefault();
      confirmBox.classList.add("show");
      quoteForm.reset();
      confirmBox.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  // Active nav link highlighting
  var currentPage = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".main-nav a").forEach(function (link) {
    var href = link.getAttribute("href");
    if (href === currentPage) link.classList.add("active");
  });
});
