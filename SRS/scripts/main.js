(function () {
  "use strict";

  var body = document.body;
  var page = body ? body.getAttribute("data-page") : "";

  function safeJsonFetch(path) {
    return fetch(path).then(function (res) {
      if (!res.ok) {
        throw new Error("Failed to load " + path);
      }
      return res.json();
    });
  }

  function setExternalLinkPolicy() {
    var links = document.querySelectorAll("a[href]");
    links.forEach(function (link) {
      var href = link.getAttribute("href") || "";
      var isAbsolute = /^https?:\/\//i.test(href);
      var isMail = /^mailto:/i.test(href);
      if (isAbsolute || isMail) {
        link.setAttribute("target", "_blank");
        var rel = (link.getAttribute("rel") || "").split(/\s+/).filter(Boolean);
        if (!rel.includes("noopener")) rel.push("noopener");
        if (!rel.includes("noreferrer")) rel.push("noreferrer");
        link.setAttribute("rel", rel.join(" "));
      }
    });
  }

  function initMenu() {
    var menuToggle = document.querySelector("[data-menu-toggle]");
    var nav = document.querySelector("[data-primary-nav]");
    if (!menuToggle || !nav) return;

    menuToggle.addEventListener("click", function () {
      var expanded = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", String(!expanded));
      nav.classList.toggle("open", !expanded);
    });

    nav.querySelectorAll("a").forEach(function (anchor) {
      anchor.addEventListener("click", function () {
        menuToggle.setAttribute("aria-expanded", "false");
        nav.classList.remove("open");
      });
    });
  }

  function applyActiveNav() {
    var current = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (current === "submit-abstract.html") {
      current = "index.html";
    }
    var navLinks = document.querySelectorAll("[data-primary-nav] a[data-page-link]");
    navLinks.forEach(function (anchor) {
      var target = (anchor.getAttribute("data-page-link") || "").toLowerCase();
      if (target === current || (current === "" && target === "index.html")) {
        anchor.classList.add("is-active");
      }
    });
  }

  function setFooterYear() {
    var node = document.querySelector("[data-current-year]");
    if (node) node.textContent = String(new Date().getFullYear());
  }

  function applyConfig(config) {
    if (!config) return;
    document.querySelectorAll("[data-cta='register']").forEach(function (a) {
      a.href = config.cta.register;
    });
    document.querySelectorAll("[data-cta='rsvp']").forEach(function (a) {
      a.href = config.cta.rsvp;
    });
    document.querySelectorAll("[data-cta='submitInquiry']").forEach(function (a) {
      a.href = config.cta.submitInquiry;
    });
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getYouTubeEmbedUrl(url) {
    if (!url) return null;
    try {
      var parsed = new URL(url, window.location.origin);
      var host = (parsed.hostname || "").toLowerCase();
      var id = "";

      if (host.includes("youtu.be")) {
        id = (parsed.pathname || "").replace(/^\/+/, "").split("/")[0];
      } else if (host.includes("youtube.com")) {
        id = parsed.searchParams.get("v") || "";
        if (!id) {
          var segments = (parsed.pathname || "").split("/").filter(Boolean);
          var embedIdx = segments.indexOf("embed");
          if (embedIdx >= 0 && segments[embedIdx + 1]) {
            id = segments[embedIdx + 1];
          }
        }
      }

      if (!id) return null;
      return "https://www.youtube.com/embed/" + encodeURIComponent(id);
    } catch (_err) {
      return null;
    }
  }

  function renderYearMediaLibrary(yearMedia) {
    if (!yearMedia) return;

    var keynotes = Array.isArray(yearMedia.keynotes) ? yearMedia.keynotes : [];
    var videos = Array.isArray(yearMedia.videos) ? yearMedia.videos : [];

    var yearFromPage = (page || "").replace(/^year-/, "");
    var keynoteRoot = document.querySelector('[data-year-keynotes="' + yearFromPage + '"]');
    var videosRoot = document.querySelector('[data-year-videos="' + yearFromPage + '"]');

    if (keynoteRoot) {
      keynoteRoot.innerHTML = keynotes
        .map(function (speaker) {
          return (
            '<article class="card">' +
            '<span class="pill">Keynote Speaker</span>' +
            "<h3>" + escapeHtml(speaker.name || "Speaker") + "</h3>" +
            (speaker.role ? "<p><strong>Role:</strong> " + escapeHtml(speaker.role) + "</p>" : "") +
            (speaker.bio ? '<p style="margin-top:0.6rem;">' + escapeHtml(speaker.bio) + "</p>" : "") +
            "</article>"
          );
        })
        .join("");
    }

    if (videosRoot) {
      videosRoot.innerHTML = videos
        .map(function (video, idx) {
          var title = video.title || "Video " + (idx + 1);
          var embedUrl = getYouTubeEmbedUrl(video.url);
          var embedBlock = embedUrl
            ? '<div class="video-frame"><iframe src="' +
              embedUrl +
              '" title="' +
              escapeHtml(title) +
              '" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>'
            : '<p style="margin-top:0.8rem;"><a href="' + escapeHtml(video.url) + '">Watch video</a></p>';

          return (
            '<article class="video-card">' +
            "<h3>" + escapeHtml(title) + "</h3>" +
            embedBlock +
            '<p class="video-meta"><a href="' + escapeHtml(video.url) + '">Open on YouTube</a></p>' +
            "</article>"
          );
        })
        .join("");
    }

    setExternalLinkPolicy();
  }

  function countWords(text) {
    var value = String(text || "").trim();
    return value ? value.split(/\s+/).length : 0;
  }

  function initPaperForm() {
    var form = document.querySelector("[data-paper-form]");
    if (!form) return;

    var statusNode = form.querySelector("[data-paper-form-status]");
    var abstractNode = form.querySelector("textarea[name='abstract']");
    var countNode = form.querySelector("[data-abstract-count]");

    function updateCharCount() {
      if (!abstractNode || !countNode) return;
      countNode.textContent = String((abstractNode.value || "").length);
    }

    updateCharCount();
    if (abstractNode) {
      abstractNode.addEventListener("input", updateCharCount);
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        if (statusNode) {
          statusNode.textContent = "Please complete all required fields.";
        }
        return;
      }

      var abstractText = abstractNode ? abstractNode.value : "";
      var words = countWords(abstractText);
      if (words > 250) {
        if (statusNode) {
          statusNode.textContent = "Abstract is too long (" + words + " words). Please keep it within 250 words.";
        }
        return;
      }

      var formData = new FormData(form);
      var projectTitle = String(formData.get("projectTitle") || "Untitled Project").trim();
      var subject = "AISRS 2026 Abstract Submission - " + projectTitle;

      var lines = [
        "AISRS 2026 Abstract Submission",
        "",
        "Student Name: " + String(formData.get("studentName") || "").trim(),
        "Contact Email: " + String(formData.get("contactEmail") || "").trim(),
        "School: " + String(formData.get("school") || "").trim(),
        "Grade: " + String(formData.get("grade") || "").trim(),
        "Project Title: " + projectTitle,
        "Project Track: " + String(formData.get("track") || "").trim(),
        "Project Demo/Video URL: " + String(formData.get("demoUrl") || "").trim(),
        "",
        "Abstract:",
        abstractText,
        "",
        "Word Count: " + words
      ];

      var mailto =
        "mailto:info@aiclub.world?subject=" +
        encodeURIComponent(subject) +
        "&body=" +
        encodeURIComponent(lines.join("\n"));

      if (statusNode) {
        statusNode.textContent = "Opening your email app with your submission draft...";
      }

      window.location.href = mailto;
    });
  }

  function createYearCard(entry) {
    var linkItems = (entry.links || [])
      .map(function (lnk) {
        return '<li><a href="' + lnk.url + '">' + lnk.label + "</a></li>";
      })
      .join("");

    return (
      '<article class="year-card" data-year-item="' + entry.year + '">' +
      '<img src="' + entry.heroImage + '" alt="' + entry.title + ' cover" />' +
      '<span class="pill">' + entry.year + '</span>' +
      '<h3>' + entry.title + '</h3>' +
      '<p><strong>Keynote:</strong> ' + entry.keynote + '</p>' +
      '<p style="margin-top:0.55rem;">' + entry.summary + '</p>' +
      '<ul class="year-links">' +
      linkItems +
      '</ul>' +
      '</article>'
    );
  }

  function renderPastPage(data) {
    var years = Array.isArray(data.years) ? data.years : [];
    var highlights = Array.isArray(data.projectHighlights) ? data.projectHighlights : [];
    var special = Array.isArray(data.specialLinks) ? data.specialLinks : [];

    var filterRoot = document.querySelector("#yearFilter");
    var gridRoot = document.querySelector("#yearsGrid");
    var projectRoot = document.querySelector("#projectHighlights");
    var specialRoot = document.querySelector("#specialLinks");

    if (!gridRoot || !projectRoot || !specialRoot) return;

    var yearNumbers = years.map(function (y) { return y.year; });
    var options = ["All"].concat(yearNumbers);

    filterRoot.innerHTML = options
      .map(function (label, idx) {
        var activeClass = idx === 0 ? "active" : "";
        var value = label === "All" ? "all" : String(label);
        return '<button type="button" class="' + activeClass + '" data-year-filter="' + value + '">' + label + '</button>';
      })
      .join("");

    function drawYears(filter) {
      var rows = years.filter(function (entry) {
        return filter === "all" ? true : String(entry.year) === filter;
      });
      gridRoot.innerHTML = rows.map(createYearCard).join("");
      setExternalLinkPolicy();
    }

    drawYears("all");

    filterRoot.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        filterRoot.querySelectorAll("button").forEach(function (other) {
          other.classList.remove("active");
        });
        btn.classList.add("active");
        drawYears(btn.getAttribute("data-year-filter") || "all");
      });
    });

    projectRoot.innerHTML = highlights
      .map(function (item) {
        return (
          '<article class="project-card">' +
          '<h3>' + item.title + '</h3>' +
          '<p><strong>Student:</strong> ' + item.student + '</p>' +
          '<p><strong>School:</strong> ' + item.school + '</p>' +
          '<p style="margin-top:0.6rem;"><a href="' + item.url + '">Project details</a></p>' +
          '</article>'
        );
      })
      .join("");

    specialRoot.innerHTML =
      '<ul class="special-links">' +
      special
        .map(function (item) {
          return '<li><a href="' + item.url + '">' + item.label + '</a></li>';
        })
        .join("") +
      '</ul>';

    setExternalLinkPolicy();
  }

  function init() {
    initMenu();
    applyActiveNav();
    setFooterYear();
    setExternalLinkPolicy();
    initPaperForm();

    Promise.allSettled([
      safeJsonFetch("./data/site-config.json"),
      safeJsonFetch("./data/past-symposia.json"),
      safeJsonFetch("./data/year-videos.json")
    ]).then(
      function (results) {
        if (results[0].status === "fulfilled") {
          applyConfig(results[0].value);
        }

        if (page === "past" && results[1].status === "fulfilled") {
          renderPastPage(results[1].value);
        }

        if (page.indexOf("year-") === 0 && results[2].status === "fulfilled") {
          var yearKey = page.replace(/^year-/, "");
          var yearData = results[2].value && results[2].value[yearKey];
          renderYearMediaLibrary(yearData);
        }
      }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
