import { useState, useEffect, useCallback, useMemo } from "react";

// ============================================================
// TEDERGA CODE QUALITY ANALYZER
// Kod Kalitesi Olcum ve Raporlama Sistemi
// ============================================================

const LANG_CONFIGS = {
  javascript: {
    extensions: [".js", ".jsx", ".mjs"],
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    functionPatterns: [
      /function\s+(\w+)\s*\(/g,
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w]+)\s*=>/g,
      /(\w+)\s*:\s*(?:async\s+)?function/g,
      /(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g,
    ],
    classPattern: /class\s+(\w+)/g,
    importPattern: /import\s+.+\s+from\s+['""](.+)['""]]/g,
    namingConvention: "camelCase",
  },
  typescript: {
    extensions: [".ts", ".tsx"],
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    functionPatterns: [
      /function\s+(\w+)\s*[<(]/g,
      /(?:const|let|var)\s+(\w+)\s*(?::\s*\w+(?:<[^>]+>)?\s*)?=\s*(?:async\s+)?(?:\([^)]*\)|[\w]+)\s*=>/g,
      /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+(?:<[^>]+>)?)?\s*\{/g,
    ],
    classPattern: /(?:class|interface|type|enum)\s+(\w+)/g,
    importPattern: /import\s+.+\s+from\s+['""](.+)['""]]/g,
    namingConvention: "camelCase",
  },
  csharp: {
    extensions: [".cs"],
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    functionPatterns: [
      /(?:public|private|protected|internal|static|async|virtual|override|abstract)\s+(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/g,
    ],
    classPattern: /(?:class|interface|struct|enum|record)\s+(\w+)/g,
    importPattern: /using\s+([\w.]+)\s*;/g,
    namingConvention: "PascalCase",
  },
  dart: {
    extensions: [".dart"],
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    functionPatterns: [
      /(?:void|int|String|bool|double|Future|Stream|dynamic|Widget|State|\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/g,
    ],
    classPattern: /(?:class|mixin|extension|enum)\s+(\w+)/g,
    importPattern: /import\s+['""](.+)['""]]/g,
    namingConvention: "camelCase",
  },
  go: {
    extensions: [".go"],
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    functionPatterns: [/func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/g],
    classPattern: /type\s+(\w+)\s+struct/g,
    importPattern: /import\s+(?:"(.+)"|\(([^)]+)\))/g,
    namingConvention: "camelCase",
  },
  vue: {
    extensions: [".vue"],
    singleComment: "//",
    multiCommentStart: "/*",
    multiCommentEnd: "*/",
    functionPatterns: [
      /function\s+(\w+)\s*\(/g,
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w]+)\s*=>/g,
      /(\w+)\s*\([^)]*\)\s*\{/g,
    ],
    classPattern: /(?:name|components)\s*:/g,
    importPattern: /import\s+.+\s+from\s+['""](.+)['""]]/g,
    namingConvention: "camelCase",
  },
};

function detectLanguage(filename) {
  const ext = "." + filename.split(".").pop().toLowerCase();
  for (const [lang, config] of Object.entries(LANG_CONFIGS)) {
    if (config.extensions.includes(ext)) return lang;
  }
  return "javascript";
}

function countLines(code) {
  const lines = code.split("\n");
  let total = lines.length;
  let blank = 0;
  let comment = 0;
  let inMultiComment = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") { blank++; continue; }
    if (inMultiComment) {
      comment++;
      if (trimmed.includes("*/")) inMultiComment = false;
      continue;
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("#")) { comment++; continue; }
    if (trimmed.startsWith("/*")) {
      comment++;
      if (!trimmed.includes("*/")) inMultiComment = true;
      continue;
    }
  }
  return { total, blank, comment, code: total - blank - comment };
}

function calculateCyclomaticComplexity(code) {
  const patterns = [
    /\bif\b/g, /\belse\s+if\b/g, /\bwhile\b/g, /\bfor\b/g, /\bforeach\b/g,
    /\bcase\b/g, /\bcatch\b/g, /\b\?\?/g, /\?\./g, /&&/g, /\|\|/g,
    /\?\s*[^:]+\s*:/g,
  ];
  let complexity = 1;
  for (const pattern of patterns) {
    const matches = code.match(pattern);
    if (matches) complexity += matches.length;
  }
  return complexity;
}

function extractFunctionBody(code, startIdx) {
  let braceCount = 0;
  let started = false;
  let i = startIdx;
  while (i < code.length) {
    if (code[i] === "{") { braceCount++; started = true; }
    else if (code[i] === "}") {
      braceCount--;
      if (started && braceCount === 0) return code.substring(startIdx, i + 1);
    }
    i++;
    if (i - startIdx > 5000) break;
  }
  const lineEnd = code.indexOf("\n", startIdx);
  return code.substring(startIdx, lineEnd > 0 ? lineEnd : startIdx + 200);
}

function findFunctions(code, lang) {
  const config = LANG_CONFIGS[lang];
  if (!config) return [];
  const functions = [];
  const reserved = ["if","else","for","while","switch","catch","return","new","get","set","var","let","const","function","class","import","export","from","async","await","try","throw","void","null","undefined","true","false"];
  for (const pattern of config.functionPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(code)) !== null) {
      const name = match[1];
      if (name && !reserved.includes(name)) {
        const startIdx = match.index;
        const body = extractFunctionBody(code, startIdx);
        functions.push({ name, startLine: code.substring(0, startIdx).split("\n").length, lineCount: body.split("\n").length, complexity: calculateCyclomaticComplexity(body), body });
      }
    }
  }
  const seen = new Set();
  return functions.filter(f => {
    const key = f.name + ":" + f.startLine;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectDuplication(code) {
  const lines = code.split("\n").map(l => l.trim()).filter(l => l.length > 10 && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("import") && !l.startsWith("using"));
  const duplicates = new Map();
  for (let i = 0; i < lines.length - 2; i++) {
    const block = lines.slice(i, i + 3).join("|");
    if (duplicates.has(block)) duplicates.get(block).count++;
    else duplicates.set(block, { count: 1, line: i + 1 });
  }
  const dupes = [...duplicates.entries()].filter(([_, v]) => v.count > 1);
  const duplicatedLines = dupes.reduce((sum, [_, v]) => sum + v.count * 3, 0);
  const percentage = lines.length > 0 ? (duplicatedLines / lines.length) * 100 : 0;
  return {
    percentage: Math.min(percentage, 100),
    instances: dupes.length,
    blocks: dupes.slice(0, 5).map(([block, info]) => ({ preview: block.split("|")[0].substring(0, 60), occurrences: info.count + 1 })),
  };
}

function checkNamingConventions(code, lang) {
  const config = LANG_CONFIGS[lang];
  const issues = [];
  const functions = findFunctions(code, lang);
  for (const func of functions) {
    if (config.namingConvention === "camelCase") {
      if (func.name[0] === func.name[0].toUpperCase() && !func.name.match(/^[A-Z][a-z]/)) {
        issues.push({ type: "function", name: func.name, expected: "camelCase", line: func.startLine });
      }
    } else if (config.namingConvention === "PascalCase") {
      if (func.name[0] === func.name[0].toLowerCase()) {
        issues.push({ type: "method", name: func.name, expected: "PascalCase", line: func.startLine });
      }
    }
  }
  const varPattern = /(?:const|let|var|int|string|bool|double|float)\s+([a-zA-Z])\s*[=;,)]/g;
  let match;
  while ((match = varPattern.exec(code)) !== null) {
    const varName = match[1];
    if (!["i","j","k","x","y","e","_"].includes(varName)) {
      const line = code.substring(0, match.index).split("\n").length;
      issues.push({ type: "variable", name: varName, expected: "descriptive name", line });
    }
  }
  return issues;
}

function checkCodeSmells(code, lang) {
  const smells = [];
  const lines = code.split("\n");
  lines.forEach((line, i) => {
    if (line.length > 120) smells.push({ type: "long_line", line: i + 1, message: "Satir cok uzun (" + line.length + " karakter)", severity: "warning" });
  });
  const todoPattern = /\/\/\s*(TODO|FIXME|HACK|XXX|BUG)[\s:]/gi;
  let match;
  while ((match = todoPattern.exec(code)) !== null) {
    const line = code.substring(0, match.index).split("\n").length;
    smells.push({ type: "todo", line, message: match[1] + " yorum bulundu", severity: "info" });
  }
  let maxNesting = 0, currentNesting = 0;
  for (let i = 0; i < lines.length; i++) {
    const opens = (lines[i].match(/\{/g) || []).length;
    const closes = (lines[i].match(/\}/g) || []).length;
    currentNesting += opens - closes;
    if (currentNesting > maxNesting) maxNesting = currentNesting;
    if (currentNesting > 4) smells.push({ type: "deep_nesting", line: i + 1, message: "Derin ic ice gecme (" + currentNesting + " seviye)", severity: "error" });
  }
  const debugPatterns = [/console\.(log|warn|error|debug)\(/g, /print\(/g, /Debug\.(Log|Write)/g, /fmt\.Print/g];
  for (const pattern of debugPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(code)) !== null) {
      const line = code.substring(0, match.index).split("\n").length;
      smells.push({ type: "debug", line, message: "Debug/log ifadesi birakilmis", severity: "warning" });
    }
  }
  const magicPattern = /(?:==|!=|>|<|>=|<=|\+|-|\*|\/)\s*(\d{2,})\b/g;
  while ((match = magicPattern.exec(code)) !== null) {
    const num = parseInt(match[1]);
    if (![100, 200, 404, 500, 1000, 1024].includes(num)) {
      const line = code.substring(0, match.index).split("\n").length;
      smells.push({ type: "magic_number", line, message: "Sihirli sayi: " + match[1], severity: "warning" });
    }
  }
  const emptyCatch = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
  while ((match = emptyCatch.exec(code)) !== null) {
    const line = code.substring(0, match.index).split("\n").length;
    smells.push({ type: "empty_catch", line, message: "Bos catch blogu", severity: "error" });
  }
  return smells;
}

function analyzeFile(filename, code) {
  const lang = detectLanguage(filename);
  const lineInfo = countLines(code);
  const functions = findFunctions(code, lang);
  const duplication = detectDuplication(code);
  const namingIssues = checkNamingConventions(code, lang);
  const codeSmells = checkCodeSmells(code, lang);
  const totalComplexity = functions.reduce((sum, f) => sum + f.complexity, 0);
  const avgComplexity = functions.length > 0 ? totalComplexity / functions.length : 1;
  const maxComplexity = functions.length > 0 ? Math.max(...functions.map(f => f.complexity)) : 1;
  const commentRatio = lineInfo.code > 0 ? (lineInfo.comment / lineInfo.code) * 100 : 0;
  const longFunctions = functions.filter(f => f.lineCount > 50);
  const complexFunctions = functions.filter(f => f.complexity > 10);
  let score = 100;
  const penalties = [];
  if (avgComplexity > 15) { score -= 25; penalties.push({ metric: "Ortalama Karmasiklik", value: avgComplexity.toFixed(1), penalty: -25 }); }
  else if (avgComplexity > 10) { score -= 15; penalties.push({ metric: "Ortalama Karmasiklik", value: avgComplexity.toFixed(1), penalty: -15 }); }
  else if (avgComplexity > 7) { score -= 8; penalties.push({ metric: "Ortalama Karmasiklik", value: avgComplexity.toFixed(1), penalty: -8 }); }
  if (duplication.percentage > 20) { score -= 20; penalties.push({ metric: "Kod Tekrari", value: "%" + duplication.percentage.toFixed(1), penalty: -20 }); }
  else if (duplication.percentage > 10) { score -= 12; penalties.push({ metric: "Kod Tekrari", value: "%" + duplication.percentage.toFixed(1), penalty: -12 }); }
  else if (duplication.percentage > 5) { score -= 5; penalties.push({ metric: "Kod Tekrari", value: "%" + duplication.percentage.toFixed(1), penalty: -5 }); }
  const namingScore = namingIssues.length;
  if (namingScore > 10) { score -= 15; penalties.push({ metric: "Isimlendirme", value: namingScore + " sorun", penalty: -15 }); }
  else if (namingScore > 5) { score -= 8; penalties.push({ metric: "Isimlendirme", value: namingScore + " sorun", penalty: -8 }); }
  else if (namingScore > 0) { score -= 3; penalties.push({ metric: "Isimlendirme", value: namingScore + " sorun", penalty: -3 }); }
  if (lineInfo.code > 500) { score -= 10; penalties.push({ metric: "Dosya Uzunlugu", value: lineInfo.code + " satir", penalty: -10 }); }
  else if (lineInfo.code > 300) { score -= 5; penalties.push({ metric: "Dosya Uzunlugu", value: lineInfo.code + " satir", penalty: -5 }); }
  if (longFunctions.length > 3) { score -= 15; penalties.push({ metric: "Uzun Fonksiyonlar", value: longFunctions.length + " adet", penalty: -15 }); }
  else if (longFunctions.length > 0) { score -= 5 * longFunctions.length; penalties.push({ metric: "Uzun Fonksiyonlar", value: longFunctions.length + " adet", penalty: -5 * longFunctions.length }); }
  const errorSmells = codeSmells.filter(s => s.severity === "error").length;
  const warningSmells = codeSmells.filter(s => s.severity === "warning").length;
  if (errorSmells > 0) { const p = Math.min(errorSmells * 5, 20); score -= p; penalties.push({ metric: "Kritik Sorunlar", value: errorSmells + " adet", penalty: -p }); }
  if (warningSmells > 5) { const p = Math.min(warningSmells * 2, 15); score -= p; penalties.push({ metric: "Uyarilar", value: warningSmells + " adet", penalty: -p }); }
  if (commentRatio < 3 && lineInfo.code > 50) { score -= 5; penalties.push({ metric: "Yorum Orani", value: "%" + commentRatio.toFixed(1), penalty: -5 }); }
  score = Math.max(0, Math.min(100, score));
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  return {
    filename, language: lang, score, grade, lines: lineInfo,
    functions: { total: functions.length, avgComplexity: avgComplexity.toFixed(1), maxComplexity, longFunctions: longFunctions.map(f => ({ name: f.name, lines: f.lineCount, complexity: f.complexity })), complexFunctions: complexFunctions.map(f => ({ name: f.name, complexity: f.complexity, lines: f.lineCount })), all: functions.map(f => ({ name: f.name, lines: f.lineCount, complexity: f.complexity })) },
    duplication, namingIssues, codeSmells, commentRatio: commentRatio.toFixed(1), penalties,
  };
}

// Sample files for demo
const SAMPLE_FILES = {
  "UserService.cs": `using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Tederga.Services
{
    public class UserService : IUserService
    {
        private readonly AppDbContext _context;
        private readonly ILogger<UserService> _logger;

        public UserService(AppDbContext context, ILogger<UserService> logger)
        {
            _context = context;
            _logger = logger;
        }

        // TODO: Bu metodu refactor et
        public async Task<UserDto> GetUserWithPermissions(int userId)
        {
            var user = await _context.Users
                .Include(u => u.Roles)
                .ThenInclude(r => r.Permissions)
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user == null) return null;

            return new UserDto
            {
                Id = user.Id,
                Name = user.Name,
                Email = user.Email,
                Permissions = user.Roles
                    .SelectMany(r => r.Permissions)
                    .Select(p => p.Name)
                    .Distinct()
                    .ToList()
            };
        }

        public async Task<bool> DeactivateUser(int userId)
        {
            try
            {
                var user = await _context.Users.FindAsync(userId);
                if (user != null)
                {
                    user.IsActive = false;
                    await _context.SaveChangesAsync();
                    return true;
                }
                return false;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deactivating user");
                return false;
            }
        }

        // FIXME: Cache stratejisi iyilestirilmeli
        public async Task<int> GetActiveUserCount()
        {
            var count = await _context.Users.CountAsync(u => u.IsActive && u.LastLoginDate > DateTime.Now.AddDays(-30));
            return count;
        }
    }
}`,
  "dashboard.component.ts": `import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, combineLatest, takeUntil } from 'rxjs';
import { DashboardService } from './dashboard.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  dashboardData: any = null;
  isLoading = true;
  errorMessage = '';
  selectedPeriod = 'monthly';

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void { this.loadDashboard(); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  loadDashboard(): void {
    this.isLoading = true;
    this.dashboardService.getDashboardData(this.selectedPeriod).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (data) => { this.dashboardData = data; this.isLoading = false; },
      error: (err) => {
        console.error('Dashboard loading failed:', err);
        this.errorMessage = 'Dashboard yuklenemedi.';
        this.isLoading = false;
      }
    });
  }

  getStatusColor(status: string): string {
    if (status === 'open') return '#ef4444';
    if (status === 'in-progress') return '#f59e0b';
    if (status === 'resolved') return '#22c55e';
    return '#9ca3af';
  }

  formatRevenue(amount: number): string {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
  }
}`,
  "api_handler.go": `package handlers

import (
  "encoding/json"
  "fmt"
  "log"
  "net/http"
  "strconv"
  "time"
)

type APIHandler struct {
  db     *Database
  cache  *Cache
  logger *log.Logger
}

type Response struct {
  Success bool
  Data    interface{}
  Error   string
}

func NewAPIHandler(db *Database, cache *Cache, logger *log.Logger) *APIHandler {
  return &APIHandler{db: db, cache: cache, logger: logger}
}

func (h *APIHandler) HandleGetUsers(w http.ResponseWriter, r *http.Request) {
  if r.Method != http.MethodGet {
    h.sendError(w, "Method not allowed", http.StatusMethodNotAllowed)
    return
  }
  page, _ := strconv.Atoi(r.URL.Query().Get("page"))
  if page < 1 { page = 1 }
  pageSize, _ := strconv.Atoi(r.URL.Query().Get("pagesize"))
  if pageSize < 1 || pageSize > 100 { pageSize = 20 }
  query := r.URL.Query().Get("q")
  cacheKey := fmt.Sprintf("users:%s:%d:%d", query, page, pageSize)
  if cached, ok := h.cache.Get(cacheKey); ok {
    h.sendJSON(w, cached)
    return
  }
  users, total, err := h.db.GetUsers(query, page, pageSize)
  if err != nil {
    h.logger.Printf("Error fetching users: %v", err)
    h.sendError(w, "Internal server error", http.StatusInternalServerError)
    return
  }
  resp := Response{Success: true, Data: users}
  h.cache.Set(cacheKey, resp, 5*time.Minute)
  h.sendJSON(w, resp)
  _ = total
}

func (h *APIHandler) sendJSON(w http.ResponseWriter, data interface{}) {
  w.Header().Set("Content-Type", "application/json")
  json.NewEncoder(w).Encode(data)
}

func (h *APIHandler) sendError(w http.ResponseWriter, message string, status int) {
  w.Header().Set("Content-Type", "application/json")
  w.WriteHeader(status)
  json.NewEncoder(w).Encode(Response{Success: false, Error: message})
}`,
};

const COLORS = {
  bg: "#0a0e1a", bgCard: "#111827", bgCardHover: "#1a2235",
  border: "#1e293b", borderLight: "#2d3a4f",
  primary: "#3b82f6", primaryLight: "#60a5fa",
  success: "#22c55e", successBg: "rgba(34,197,94,0.1)",
  warning: "#f59e0b", warningBg: "rgba(245,158,11,0.1)",
  danger: "#ef4444", dangerBg: "rgba(239,68,68,0.1)",
  info: "#6366f1", infoBg: "rgba(99,102,241,0.1)",
  text: "#e2e8f0", textSecondary: "#94a3b8", textMuted: "#64748b",
  gradeA: "#22c55e", gradeB: "#84cc16", gradeC: "#f59e0b", gradeD: "#f97316", gradeF: "#ef4444",
};

function getGradeColor(grade) {
  const map = { A: COLORS.gradeA, B: COLORS.gradeB, C: COLORS.gradeC, D: COLORS.gradeD, F: COLORS.gradeF };
  return map[grade] || COLORS.textMuted;
}

function getScoreColor(score) {
  if (score >= 90) return COLORS.gradeA;
  if (score >= 80) return COLORS.gradeB;
  if (score >= 70) return COLORS.gradeC;
  if (score >= 60) return COLORS.gradeD;
  return COLORS.gradeF;
}

function ScoreGauge({ score, grade, size = 140 }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = getGradeColor(grade);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={COLORS.border} strokeWidth="6" />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={circumference - progress}
          strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.22, fontWeight: 800, color, fontFamily: "monospace" }}>{grade}</span>
        <span style={{ fontSize: size * 0.14, color: COLORS.textSecondary, fontFamily: "monospace" }}>{score}/100</span>
      </div>
    </div>
  );
}

function MetricBar({ label, value, max, color, suffix = "" }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{label}</span>
        <span style={{ fontSize: 12, color: COLORS.text, fontFamily: "monospace" }}>{typeof value === 'number' && value.toFixed ? value.toFixed(1) : value}{suffix}</span>
      </div>
      <div style={{ height: 6, background: COLORS.border, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: pct + "%", background: color, borderRadius: 3, transition: "width 0.8s ease" }} />
      </div>
    </div>
  );
}

function SeverityBadge({ severity }) {
  const config = {
    error: { bg: COLORS.dangerBg, color: COLORS.danger, label: "Kritik" },
    warning: { bg: COLORS.warningBg, color: COLORS.warning, label: "Uyari" },
    info: { bg: COLORS.infoBg, color: COLORS.info, label: "Bilgi" },
  };
  const c = config[severity] || config.info;
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: c.bg, color: c.color, textTransform: "uppercase" }}>
      {c.label}
    </span>
  );
}

function LangBadge({ lang }) {
  const colors = { javascript: "#f7df1e", typescript: "#3178c6", csharp: "#9b4993", dart: "#02569b", go: "#00add8", vue: "#42b883" };
  const color = colors[lang] || "#666";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: color + "22", color, border: "1px solid " + color + "44" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {lang.charAt(0).toUpperCase() + lang.slice(1)}
    </span>
  );
}

function FileDetail({ result, onClose }) {
  if (!result) return null;
  const color = getGradeColor(result.grade);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 20px", overflowY: "auto" }} onClick={onClose}>
      <div style={{ background: COLORS.bgCard, borderRadius: 16, border: "1px solid " + COLORS.border, maxWidth: 800, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "24px 28px", borderBottom: "1px solid " + COLORS.border, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: COLORS.text, fontWeight: 700 }}>{result.filename}</h2>
              <LangBadge lang={result.language} />
            </div>
            <p style={{ margin: 0, color: COLORS.textMuted, fontSize: 13 }}>Detayli Analiz Raporu</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <ScoreGauge score={result.score} grade={result.grade} size={80} />
            <button onClick={onClose} style={{ background: "none", border: "none", color: COLORS.textMuted, fontSize: 24, cursor: "pointer" }}>X</button>
          </div>
        </div>
        <div style={{ padding: "24px 28px" }}>
          {result.penalties.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ color: COLORS.text, fontSize: 14, fontWeight: 600, marginBottom: 12, textTransform: "uppercase" }}>Puan Kirilimi</h3>
              <div style={{ background: COLORS.bg, borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid " + COLORS.border }}>
                  <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>Baslangic</span>
                  <span style={{ color: COLORS.success, fontFamily: "monospace", fontSize: 14, fontWeight: 700 }}>100</span>
                </div>
                {result.penalties.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
                    <span style={{ color: COLORS.textSecondary, fontSize: 13 }}>{p.metric} <span style={{ color: COLORS.textMuted }}>({p.value})</span></span>
                    <span style={{ color: COLORS.danger, fontFamily: "monospace", fontSize: 13, fontWeight: 600 }}>{p.penalty}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid " + COLORS.border }}>
                  <span style={{ color: COLORS.text, fontSize: 13, fontWeight: 600 }}>Final Skor</span>
                  <span style={{ color, fontFamily: "monospace", fontSize: 16, fontWeight: 800 }}>{result.score}</span>
                </div>
              </div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div style={{ background: COLORS.bg, borderRadius: 8, padding: 16 }}>
              <h4 style={{ color: COLORS.textMuted, fontSize: 11, textTransform: "uppercase", marginBottom: 12 }}>Satir Bilgisi</h4>
              <MetricBar label="Kod satirlari" value={result.lines.code} max={500} color={COLORS.primary} />
              <MetricBar label="Yorum satirlari" value={result.lines.comment} max={result.lines.code || 1} color={COLORS.info} />
              <MetricBar label="Bos satirlar" value={result.lines.blank} max={result.lines.total} color={COLORS.textMuted} />
              <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 8 }}>Yorum orani: <span style={{ color: parseFloat(result.commentRatio) > 10 ? COLORS.success : COLORS.warning, fontWeight: 600 }}>%{result.commentRatio}</span></div>
            </div>
            <div style={{ background: COLORS.bg, borderRadius: 8, padding: 16 }}>
              <h4 style={{ color: COLORS.textMuted, fontSize: 11, textTransform: "uppercase", marginBottom: 12 }}>Karmasiklik</h4>
              <MetricBar label="Ortalama" value={parseFloat(result.functions.avgComplexity)} max={20} color={parseFloat(result.functions.avgComplexity) <= 7 ? COLORS.success : parseFloat(result.functions.avgComplexity) <= 12 ? COLORS.warning : COLORS.danger} />
              <MetricBar label="Maksimum" value={result.functions.maxComplexity} max={30} color={result.functions.maxComplexity <= 10 ? COLORS.success : result.functions.maxComplexity <= 20 ? COLORS.warning : COLORS.danger} />
              <MetricBar label="Kod tekrari" value={result.duplication.percentage} max={25} color={result.duplication.percentage <= 5 ? COLORS.success : COLORS.warning} suffix="%" />
            </div>
          </div>
          {result.functions.all.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ color: COLORS.text, fontSize: 14, fontWeight: 600, marginBottom: 12, textTransform: "uppercase" }}>Fonksiyonlar ({result.functions.total})</h3>
              <div style={{ background: COLORS.bg, borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>{["Fonksiyon","Satir","Karmasiklik","Durum"].map(h => (<th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", borderBottom: "1px solid " + COLORS.border }}>{h}</th>))}</tr>
                  </thead>
                  <tbody>
                    {result.functions.all.map((f, i) => {
                      const isLong = f.lines > 50, isComplex = f.complexity > 10;
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid " + COLORS.border }}>
                          <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12, color: COLORS.text }}>{f.name}</td>
                          <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12, color: isLong ? COLORS.warning : COLORS.textSecondary }}>{f.lines}</td>
                          <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12, color: isComplex ? COLORS.danger : f.complexity > 7 ? COLORS.warning : COLORS.success }}>{f.complexity}</td>
                          <td style={{ padding: "8px 14px" }}>
                            {isLong && <span style={{ fontSize: 10, color: COLORS.warning, marginRight: 6 }}>Uzun</span>}
                            {isComplex && <span style={{ fontSize: 10, color: COLORS.danger }}>Karmasik</span>}
                            {!isLong && !isComplex && <span style={{ fontSize: 10, color: COLORS.success }}>OK</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {result.codeSmells.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ color: COLORS.text, fontSize: 14, fontWeight: 600, marginBottom: 12, textTransform: "uppercase" }}>Kod Sorunlari ({result.codeSmells.length})</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {result.codeSmells.slice(0, 15).map((smell, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: COLORS.bg, borderRadius: 6 }}>
                    <SeverityBadge severity={smell.severity} />
                    <span style={{ fontSize: 12, color: COLORS.textSecondary, fontFamily: "monospace", minWidth: 50 }}>:{smell.line}</span>
                    <span style={{ fontSize: 13, color: COLORS.text }}>{smell.message}</span>
                  </div>
                ))}
                {result.codeSmells.length > 15 && <p style={{ color: COLORS.textMuted, fontSize: 12, textAlign: "center" }}>...ve {result.codeSmells.length - 15} sorun daha</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CodeQualityAnalyzer() {
  const [results, setResults] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [customFiles, setCustomFiles] = useState({});
  const [uploadName, setUploadName] = useState("");
  const [uploadCode, setUploadCode] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const allFiles = useMemo(() => ({ ...SAMPLE_FILES, ...customFiles }), [customFiles]);

  const runAnalysis = useCallback(() => {
    setAnalyzing(true);
    setTimeout(() => {
      const analysisResults = Object.entries(allFiles).map(([name, code]) => analyzeFile(name, code));
      analysisResults.sort((a, b) => a.score - b.score);
      setResults(analysisResults);
      setAnalyzing(false);
      setActiveTab("overview");
    }, 600);
  }, [allFiles]);

  useEffect(() => { runAnalysis(); }, []);

  const overallScore = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : 0;
  const overallGrade = overallScore >= 90 ? "A" : overallScore >= 80 ? "B" : overallScore >= 70 ? "C" : overallScore >= 60 ? "D" : "F";
  const totalSmells = results.reduce((s, r) => s + r.codeSmells.length, 0);
  const totalFunctions = results.reduce((s, r) => s + r.functions.total, 0);
  const totalLines = results.reduce((s, r) => s + r.lines.code, 0);
  const avgDuplication = results.length > 0 ? results.reduce((s, r) => s + r.duplication.percentage, 0) / results.length : 0;
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  results.forEach(r => { gradeDistribution[r.grade]++; });

  const addCustomFile = () => {
    if (uploadName && uploadCode) {
      setCustomFiles(prev => ({ ...prev, [uploadName]: uploadCode }));
      setUploadName(""); setUploadCode("");
    }
  };

  const removeCustomFile = (name) => {
    setCustomFiles(prev => { const next = { ...prev }; delete next[name]; return next; });
  };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ background: "linear-gradient(135deg, " + COLORS.bgCard + " 0%, #0f1629 100%)", borderBottom: "1px solid " + COLORS.border, padding: "20px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, " + COLORS.primary + ", " + COLORS.info + ")", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#fff" }}>TQ</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>TEDERGA Code Quality</h1>
              <p style={{ margin: 0, fontSize: 12, color: COLORS.textMuted }}>Kod Kalitesi Analiz ve Raporlama Sistemi</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: COLORS.textMuted }}>{results.length} dosya analiz edildi</span>
            <button onClick={runAnalysis} disabled={analyzing}
              style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: analyzing ? COLORS.border : "linear-gradient(135deg, " + COLORS.primary + ", " + COLORS.info + ")", color: "#fff", fontSize: 13, fontWeight: 600, cursor: analyzing ? "default" : "pointer", opacity: analyzing ? 0.6 : 1 }}>
              {analyzing ? "Analiz ediliyor..." : "Analiz Et"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px" }}>
        <div style={{ display: "flex", borderBottom: "1px solid " + COLORS.border, marginBottom: 24 }}>
          {[{ id: "overview", label: "Genel Bakis" }, { id: "files", label: "Dosya Detaylari" }, { id: "upload", label: "Kod Yukle" }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ padding: "14px 24px", background: "none", border: "none", borderBottom: "2px solid " + (activeTab === tab.id ? COLORS.primary : "transparent"), color: activeTab === tab.id ? COLORS.text : COLORS.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && results.length > 0 && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24, marginBottom: 24 }}>
              <div style={{ background: COLORS.bgCard, borderRadius: 16, border: "1px solid " + COLORS.border, padding: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <ScoreGauge score={overallScore} grade={overallGrade} size={160} />
                <div style={{ textAlign: "center" }}>
                  <p style={{ color: COLORS.textSecondary, fontSize: 13, margin: "0 0 4px" }}>Proje Genel Skoru</p>
                  <p style={{ color: getGradeColor(overallGrade), fontSize: 13, fontWeight: 600, margin: 0 }}>
                    {overallScore >= 80 ? "Iyi durumda" : overallScore >= 60 ? "Iyilestirme gerekli" : "Acil mudahale gerekli"}
                  </p>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "1fr 1fr", gap: 16 }}>
                {[
                  { label: "Toplam Dosya", value: results.length, icon: "FILE", color: COLORS.primary },
                  { label: "Toplam Satir", value: totalLines.toLocaleString("tr-TR"), icon: "LINES", color: COLORS.info },
                  { label: "Fonksiyon Sayisi", value: totalFunctions, icon: "FN", color: COLORS.primaryLight },
                  { label: "Kod Sorunlari", value: totalSmells, icon: "BUG", color: totalSmells > 20 ? COLORS.danger : COLORS.warning },
                  { label: "Ort. Tekrar Orani", value: "%" + avgDuplication.toFixed(1), icon: "DUP", color: avgDuplication > 10 ? COLORS.danger : COLORS.success },
                  { label: "F Notu Dosyalar", value: gradeDistribution.F, icon: "F!", color: gradeDistribution.F > 0 ? COLORS.danger : COLORS.success },
                ].map((stat, i) => (
                  <div key={i} style={{ background: COLORS.bgCard, borderRadius: 12, border: "1px solid " + COLORS.border, padding: "16px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <p style={{ margin: "0 0 6px", fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase" }}>{stat.label}</p>
                        <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: stat.color, fontFamily: "monospace" }}>{stat.value}</p>
                      </div>
                      <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700 }}>{stat.icon}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: COLORS.bgCard, borderRadius: 16, border: "1px solid " + COLORS.border, padding: 24, marginBottom: 24 }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: COLORS.text, textTransform: "uppercase" }}>Not Dagilimi</h3>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-end", height: 120 }}>
                {Object.entries(gradeDistribution).map(([grade, count]) => {
                  const maxCount = Math.max(...Object.values(gradeDistribution), 1);
                  const height = (count / maxCount) * 100;
                  return (
                    <div key={grade} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, color: COLORS.textSecondary, fontFamily: "monospace", fontWeight: 600 }}>{count}</span>
                      <div style={{ width: "100%", maxWidth: 60, height: Math.max(height, 4) + "%", background: getGradeColor(grade), borderRadius: "6px 6px 0 0", opacity: count === 0 ? 0.2 : 1 }} />
                      <span style={{ fontSize: 14, fontWeight: 800, color: getGradeColor(grade), fontFamily: "monospace" }}>{grade}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ background: COLORS.bgCard, borderRadius: 16, border: "1px solid " + COLORS.border, padding: 24 }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: COLORS.text, textTransform: "uppercase" }}>Dosya Siralamasi</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {results.map((r, i) => (
                  <div key={r.filename} onClick={() => setSelectedFile(r)}
                    style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", background: COLORS.bg, borderRadius: 10, cursor: "pointer", border: "1px solid transparent" }}
                    onMouseEnter={e => { e.currentTarget.style.background = COLORS.bgCardHover; e.currentTarget.style.borderColor = COLORS.borderLight; }}
                    onMouseLeave={e => { e.currentTarget.style.background = COLORS.bg; e.currentTarget.style.borderColor = "transparent"; }}>
                    <span style={{ width: 24, textAlign: "center", fontSize: 12, color: COLORS.textMuted, fontFamily: "monospace" }}>#{i+1}</span>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: getGradeColor(r.grade) + "15", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontWeight: 800, fontSize: 16, color: getGradeColor(r.grade), fontFamily: "monospace" }}>{r.grade}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{r.filename}</span>
                        <LangBadge lang={r.language} />
                      </div>
                      <span style={{ fontSize: 12, color: COLORS.textMuted }}>{r.lines.code} satir · {r.functions.total} fonksiyon · {r.codeSmells.length} sorun</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ width: 120, height: 6, background: COLORS.border, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
                        <div style={{ height: "100%", width: r.score + "%", background: getScoreColor(r.score), borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: getScoreColor(r.score), fontFamily: "monospace" }}>{r.score}/100</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "files" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {results.map(r => (
              <div key={r.filename} onClick={() => setSelectedFile(r)}
                style={{ background: COLORS.bgCard, borderRadius: 14, border: "1px solid " + COLORS.border, padding: 24, cursor: "pointer" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.borderLight; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.transform = "translateY(0)"; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: COLORS.text }}>{r.filename}</h3>
                    <LangBadge lang={r.language} />
                  </div>
                  <ScoreGauge score={r.score} grade={r.grade} size={64} />
                </div>
                <MetricBar label="Karmasiklik" value={parseFloat(r.functions.avgComplexity)} max={20} color={parseFloat(r.functions.avgComplexity) <= 7 ? COLORS.success : COLORS.warning} />
                <MetricBar label="Kod Tekrari" value={r.duplication.percentage} max={25} color={r.duplication.percentage <= 5 ? COLORS.success : COLORS.warning} suffix="%" />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 12, color: COLORS.textMuted }}>
                  <span>{r.lines.code} satir</span>
                  <span>{r.functions.total} fonksiyon</span>
                  <span>{r.codeSmells.length} sorun</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "upload" && (
          <div style={{ maxWidth: 800 }}>
            <div style={{ background: COLORS.bgCard, borderRadius: 16, border: "1px solid " + COLORS.border, padding: 28 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: COLORS.text }}>Kod Dosyasi Ekle</h3>
              <p style={{ margin: "0 0 20px", fontSize: 13, color: COLORS.textMuted }}>Analiz etmek istedigin kodu yapistir. Dosya uzantisina gore dil otomatik algilanir.</p>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, color: COLORS.textSecondary, marginBottom: 6, fontWeight: 600 }}>Dosya Adi</label>
                <input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="ornek: OrderService.cs, utils.ts, main.go"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid " + COLORS.border, background: COLORS.bg, color: COLORS.text, fontSize: 14, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, color: COLORS.textSecondary, marginBottom: 6, fontWeight: 600 }}>Kod Icerigi</label>
                <textarea value={uploadCode} onChange={e => setUploadCode(e.target.value)} placeholder="Kodu buraya yapistir..." rows={16}
                  style={{ width: "100%", padding: "14px", borderRadius: 8, border: "1px solid " + COLORS.border, background: COLORS.bg, color: COLORS.text, fontSize: 13, fontFamily: "monospace", outline: "none", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={addCustomFile} disabled={!uploadName || !uploadCode}
                  style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: uploadName && uploadCode ? COLORS.primary : COLORS.border, color: "#fff", fontSize: 13, fontWeight: 600, cursor: uploadName && uploadCode ? "pointer" : "default" }}>
                  + Dosya Ekle
                </button>
                <button onClick={runAnalysis}
                  style={{ padding: "10px 24px", borderRadius: 8, border: "1px solid " + COLORS.primary, background: "transparent", color: COLORS.primary, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Tumunu Analiz Et
                </button>
              </div>
            </div>
            {Object.keys(customFiles).length > 0 && (
              <div style={{ marginTop: 20, background: COLORS.bgCard, borderRadius: 16, border: "1px solid " + COLORS.border, padding: 24 }}>
                <h4 style={{ margin: "0 0 12px", fontSize: 13, color: COLORS.textMuted, textTransform: "uppercase" }}>Eklenen Dosyalar</h4>
                {Object.keys(customFiles).map(name => (
                  <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: COLORS.bg, borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <LangBadge lang={detectLanguage(name)} />
                      <span style={{ fontSize: 13, color: COLORS.text }}>{name}</span>
                      <span style={{ fontSize: 11, color: COLORS.textMuted }}>({customFiles[name].split("\n").length} satir)</span>
                    </div>
                    <button onClick={() => removeCustomFile(name)} style={{ background: "none", border: "none", color: COLORS.danger, cursor: "pointer", fontSize: 16 }}>X</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ height: 40 }} />
      </div>
      <FileDetail result={selectedFile} onClose={() => setSelectedFile(null)} />
    </div>
  );
}
