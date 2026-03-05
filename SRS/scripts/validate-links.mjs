#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "SRS");
const pageFiles = [
  "index.html",
  "submit-abstract.html",
  "past-symposia.html",
  "about-aiclub.html",
  "symposium-2025.html",
  "symposium-2024.html",
  "symposium-2023.html",
  "symposium-2022.html",
  "symposium-2021.html"
];
const htmlFiles = pageFiles.map((f) => path.join(root, f));
const registryPath = path.join(root, "data", "links-registry.json");

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function flattenRegistry(registry) {
  return [...new Set(Object.values(registry).flat().filter(Boolean))];
}

function collectAnchorIssues(file, html) {
  const issues = [];
  const anchorRe = /<a\s+[^>]*href\s*=\s*"([^"]+)"[^>]*>/gi;
  let match;
  while ((match = anchorRe.exec(html)) !== null) {
    const fullTag = match[0];
    const href = match[1];
    const isExternal = /^https?:\/\//i.test(href) || /^mailto:/i.test(href);
    if (!isExternal) continue;

    if (!/target\s*=\s*"_blank"/i.test(fullTag)) {
      issues.push(`${path.basename(file)}: missing target=\"_blank\" on ${href}`);
    }

    const relMatch = /rel\s*=\s*"([^"]+)"/i.exec(fullTag);
    if (!relMatch) {
      issues.push(`${path.basename(file)}: missing rel on ${href}`);
      continue;
    }

    const relValues = relMatch[1].toLowerCase();
    if (!relValues.includes("noopener") || !relValues.includes("noreferrer")) {
      issues.push(`${path.basename(file)}: rel must include noopener noreferrer on ${href}`);
    }
  }
  return issues;
}

function collectNavIssues(file, html) {
  const issues = [];
  const navMatch = html.match(/<nav[^>]*data-primary-nav[^>]*>[\s\S]*?<\/nav>/i);
  if (!navMatch) {
    return [`${path.basename(file)}: missing primary navigation with data-primary-nav`];
  }

  const navHtml = navMatch[0];
  const requiredNavHrefs = [
    "./index.html",
    "./symposium-2025.html",
    "./symposium-2024.html",
    "./symposium-2023.html",
    "./symposium-2022.html",
    "./symposium-2021.html",
    "https://corp.aiclub.world/research-institute"
  ];

  requiredNavHrefs.forEach((href) => {
    if (!navHtml.includes(`href="${href}"`)) {
      issues.push(`${path.basename(file)}: missing required header link ${href}`);
    }
  });

  return issues;
}

function requireSection(file, html, id) {
  if (!html.includes(`id=\"${id}\"`)) {
    return `${path.basename(file)}: missing required section id \"${id}\"`;
  }
  return null;
}

const registry = JSON.parse(readText(registryPath));
const expectedUrls = flattenRegistry(registry);
const htmlByFile = new Map(htmlFiles.map((f) => [f, readText(f)]));
const combinedHtml = [...htmlByFile.values()].join("\n");

const missingUrls = expectedUrls.filter((url) => !combinedHtml.includes(url));
const anchorIssues = [...htmlByFile.entries()].flatMap(([file, html]) => collectAnchorIssues(file, html));
const navIssues = [...htmlByFile.entries()].flatMap(([file, html]) => collectNavIssues(file, html));

const requiredSections = [
  ["index.html", ["call-for-papers", "timeline", "program-highlights", "faq"]],
  ["submit-abstract.html", ["abstract-form-section"]],
  ["past-symposia.html", ["year-index"]],
  ["about-aiclub.html", ["offerings", "complete-link-directory"]],
  ["symposium-2025.html", ["keynote-background", "year-videos"]],
  ["symposium-2024.html", ["keynote-background", "year-videos"]],
  ["symposium-2023.html", ["keynote-background", "year-videos"]],
  ["symposium-2022.html", ["keynote-background", "year-videos"]],
  ["symposium-2021.html", ["keynote-background", "year-videos"]]
];

const sectionIssues = requiredSections
  .flatMap(([fileName, ids]) => {
    const filePath = path.join(root, fileName);
    const html = htmlByFile.get(filePath) || "";
    return ids.map((id) => requireSection(filePath, html, id)).filter(Boolean);
  });

const errors = [
  ...missingUrls.map((url) => `Missing required URL in HTML output: ${url}`),
  ...anchorIssues,
  ...navIssues,
  ...sectionIssues
];

if (errors.length > 0) {
  console.error("Validation failed.\n");
  errors.forEach((err) => console.error(`- ${err}`));
  process.exit(1);
}

console.log("Validation passed.");
console.log(`Checked ${expectedUrls.length} required URLs across ${htmlFiles.length} pages.`);
