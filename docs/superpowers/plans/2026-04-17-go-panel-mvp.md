# Go 轻量主机面板 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在独立 Go 模块中交付可运行的「裸机 Nginx + SQLite + HTTP-01 证书 + REST/最小 Web UI」MVP，满足 `docs/superpowers/specs/2026-04-17-go-panel-mvp-design.md` 的验收标准。

**Architecture:** 单进程：`chi`（或 `echo`）HTTP 服务；`database/sql` + `modernc.org/sqlite` 存站点与审计；`text/template` 渲染每站点 Nginx 片段；`nginx` 子进程执行 `-t`/`reload`（路径可注入以便测试）；`certmagic` 负责 ACME，挑战根目录与 Nginx `alias` 对齐；登录使用 **bcrypt** + **gorilla/sessions** Cookie。

**Tech Stack:** Go 1.22+，`chi`，`modernc.org/sqlite`，`golang.org/x/crypto/bcrypt`，`github.com/gorilla/sessions`，`github.com/caddyserver/certmagic`，测试用 `testing` + `t.TempDir()`。

**仓库落位（二选一，实现前固定其一）：**

- **A**：与本 Vue 仓库并列的新目录 `go-panel/`（推荐，互不污染）。
- **B**：本仓库根下 `panel/` 子目录。

下文路径以 **`go-panel/`** 为模块根；若选 B，将 `go-panel/` 全局替换为 `panel/`。

---

## 文件结构（落地前锁定）

| 路径 | 职责 |
|------|------|
| `go-panel/go.mod` | `module example.com/panel`，依赖如上 |
| `go-panel/cmd/panel/main.go` | 读配置、迁移、挂载路由、监听 |
| `go-panel/internal/config/config.go` | 环境变量 + 默认值：`DataDir`、`NginxPanelDir`、`NginxBin`、`AcmeChallengeDir`、`ListenAddr`、`SessionSecret` |
| `go-panel/internal/store/store.go` | `Open` SQLite、`Migrate`、站点 CRUD |
| `go-panel/internal/store/models.go` | `Site`、`SiteStatus`、`AuditLog` 结构体与枚举 |
| `go-panel/internal/nginx/render.go` | `RenderSite(Site) ([]byte, error)` 模板 |
| `go-panel/internal/nginx/apply.go` | 原子写、`Test`、`Reload`（可注入 `Runner` 接口） |
| `go-panel/internal/acme/service.go` | 包装 CertMagic：配置 `DataDir`、HTTP-01 根、Obtain/renew 钩子 |
| `go-panel/internal/api/router.go` | `/api/v1/*`、JSON 错误体 |
| `go-panel/internal/api/sites.go` | sites handler |
| `go-panel/internal/api/health.go` | health |
| `go-panel/internal/auth/auth.go` | `Login`/`Logout`/`Middleware` |
| `go-panel/web/templates/*.html` | 列表/表单（最小） |
| `go-panel/README.md` | systemd、sudoers 示例、首次初始化管理员 |

---

### Task 1: Go 模块与配置结构

**Files:**

- Create: `go-panel/go.mod`
- Create: `go-panel/internal/config/config.go`

- [ ] **Step 1: 初始化模块**

```bash
mkdir -p go-panel && cd go-panel
go mod init example.com/panel
go get github.com/go-chi/chi/v5@v5.1.0
```

- [ ] **Step 2: 实现 `config.Load()`**

创建 `internal/config/config.go`：

```go
package config

import (
	"errors"
	"os"
	"path/filepath"
)

type Config struct {
	ListenAddr        string // 默认 "127.0.0.1:9443"
	DataDir           string // 默认 "/var/lib/panel"
	DBPath            string // DataDir/panel.db
	NginxPanelDir     string // 默认 "/etc/nginx/panel.d"
	NginxBin          string // 默认 "nginx"
	AcmeChallengeDir  string // 默认 DataDir/acme-challenge
	CertsDir          string // 默认 DataDir/certs
	SessionSecret     string // 必填，可从 env PANEL_SESSION_SECRET
	ACMEEmail         string // env PANEL_ACME_EMAIL
	ACMEStaging       bool   // env PANEL_ACME_STAGING=true
}

func Load() (*Config, error) {
	c := &Config{
		ListenAddr:       get("PANEL_LISTEN", "127.0.0.1:9443"),
		DataDir:          get("PANEL_DATA_DIR", "/var/lib/panel"),
		NginxPanelDir:    get("PANEL_NGINX_DIR", "/etc/nginx/panel.d"),
		NginxBin:         get("PANEL_NGINX_BIN", "nginx"),
		SessionSecret:    os.Getenv("PANEL_SESSION_SECRET"),
		ACMEEmail:        os.Getenv("PANEL_ACME_EMAIL"),
	}
	if c.SessionSecret == "" {
		return nil, errSessionSecret
	}
	c.AcmeChallengeDir = filepath.Join(c.DataDir, "acme-challenge")
	c.CertsDir = filepath.Join(c.DataDir, "certs")
	c.DBPath = filepath.Join(c.DataDir, "panel.db")
	c.ACMEStaging = os.Getenv("PANEL_ACME_STAGING") == "true"
	return c, nil
}

func get(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
```

补充包级 `var errSessionSecret = errors.New("PANEL_SESSION_SECRET required")`。

- [ ] **Step 3: 编译检查**

```bash
cd go-panel && go build ./...
```

预期：成功（`main` 尚未创建时可只 `go build ./internal/config`）。

- [ ] **Step 4: Commit**

```bash
git add go-panel/go.mod go-panel/internal/config/config.go
git commit -m "feat(panel): go module and config loader"
```

---

### Task 2: 站点模型与 SQLite 迁移

**Files:**

- Create: `go-panel/internal/store/models.go`
- Create: `go-panel/internal/store/store.go`
- Create: `go-panel/internal/store/store_test.go`

- [ ] **Step 1: 写失败测试 `TestOpenAndMigrate`**

`internal/store/store_test.go`：

```go
package store

import (
	"path/filepath"
	"testing"
)

func TestOpenAndMigrate(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err := s.DB().Exec(`SELECT 1 FROM sites LIMIT 1`); err != nil {
		t.Fatal("sites table missing:", err)
	}
}
```

运行：`cd go-panel && go test ./internal/store/ -v -run TestOpenAndMigrate`  
预期：**FAIL**（`Open` / `sites` 未实现）。

- [ ] **Step 2: 实现 `Open` + `Migrate`**

`internal/store/store.go`：使用 `modernc.org/sqlite`，`CREATE TABLE IF NOT EXISTS sites (...)`，字段含 `id`、`primary_host`、`upstream_url`、`want_https`、`status`、`last_error`、`created_at`；`audit_logs` 表含 `id`、`action`、`detail`、`created_at`。

`models.go`：`type SiteStatus string` 常量 `pending/applied/failed`。

- [ ] **Step 3: 再跑测试**

预期：**PASS**。

- [ ] **Step 4: Commit**

```bash
git add go-panel/internal/store/
git commit -m "feat(panel): sqlite store and migrations"
```

---

### Task 3: Nginx 渲染（证书未就绪仅 HTTP）

**Files:**

- Create: `go-panel/internal/nginx/render.go`
- Create: `go-panel/internal/nginx/render_test.go`

- [ ] **Step 1: 表驱动测试**

断言：当 `WantHTTPS=true` 但 `CertReady=false` 时，输出 **无** `listen 443`、**无** `ssl_certificate`；含 `proxy_pass` 与 `location /.well-known/acme-challenge/` 的 `alias` 到给定目录。

```go
func TestRender_HTTPOnlyWhenCertMissing(t *testing.T) {
	out, err := Render(RenderInput{
		PrimaryHost:     "www.example.com",
		UpstreamURL:     "http://127.0.0.1:3000",
		WantHTTPS:       true,
		CertReady:       false,
		AcmeAliasPath:   "/var/lib/panel/acme-challenge",
	})
	// assert no "listen 443", no ssl_certificate; contains proxy_pass and alias
}
```

- [ ] **Step 2: 实现 `Render`**

使用 `text/template`，每站点一文件内容（注释头含 `managed by panel`）。

- [ ] **Step 3: `go test ./internal/nginx/ -v`**

预期：PASS。

- [ ] **Step 4: Commit**

`git commit -m "feat(panel): nginx template render with cert gating"`

---

### Task 4: Nginx 应用器（原子写 + 假 nginx 集成测试）

**Files:**

- Create: `go-panel/internal/nginx/apply.go`
- Create: `go-panel/internal/nginx/apply_test.go`

- [ ] **Step 1: 定义接口**

```go
type Runner interface {
	Test(ctx context.Context, nginxBin, confPath string) (stderr string, err error)
	Reload(ctx context.Context, nginxBin string) error
}
```

默认实现调用 `exec.CommandContext`。

- [ ] **Step 2: 集成测试**

在 `t.TempDir()` 创建假 `nginx` 脚本：

- 参数含 `-t` 时 exit 1 → 断言 **正式 conf 未被覆盖**（比较 mtime 或内容哈希）。
- exit 0 → 断言 **rename 成功** 且 `reload` 被调用（脚本 touch 某文件）。

- [ ] **Step 3: 实现 `Apply(rendered []byte, destPath string, r Runner)`**

写入 `destPath.tmp`，`r.Test` 指向包含 `include` 的临时主配置或 `-c` 最小化（若系统 nginx 不可用，测试仅用假二进制）。

- [ ] **Step 4: Commit**

`git commit -m "feat(panel): atomic nginx apply with fake runner tests"`

---

### Task 5: 认证（bcrypt + session）

**Files:**

- Create: `go-panel/internal/auth/auth.go`
- Create: `go-panel/cmd/panel/initadmin.go`（一次性哈希写入，或子命令）

- [ ] **Step 1: 表 `admin_users`**：`username` + `password_hash`。

- [ ] **Step 2: `Login` POST** 校验 bcrypt；**Middleware** 校验 session cookie（`gorilla/sessions`，`HttpOnly` + `SameSite=Lax`）。

- [ ] **Step 3: 单元测试** 使用内存 store + 预置 hash（`bcrypt.GenerateFromPassword` 一次贴常量或测试内生成）。

- [ ] **Step 4: Commit**

`git commit -m "feat(panel): admin login and session middleware"`

---

### Task 6: REST API — sites + health

**Files:**

- Create: `go-panel/internal/api/router.go`
- Create: `go-panel/internal/api/sites.go`
- Create: `go-panel/internal/api/health.go`
- Create: `go-panel/internal/api/errors.go`（统一 JSON）

- [ ] **Step 1: `GET /api/v1/health`** 返回 `{"ok":true,"db":"ok"}`（`db.Ping()`）。

- [ ] **Step 2: `GET/POST/PATCH/DELETE /api/v1/sites`**（JSON），未登录 **401**。

- [ ] **Step 3: `httptest` 覆盖** 创建站点、列表、非法域名 **400**。

- [ ] **Step 4: Commit**

`git commit -m "feat(panel): REST API for sites and health"`

---

### Task 7: 应用管线串联（API → 渲染 → Apply）

**Files:**

- Modify: `go-panel/internal/api/sites.go`
- Modify: `go-panel/internal/acme/service.go`（可先 stub `CertReady`）

- [ ] **Step 1: `POST /api/v1/sites` 后** 调 `Render` + `Apply`；失败写 `last_error`、`status=failed`。

- [ ] **Step 2: 成功** `status=applied`，写 `audit_logs`。

- [ ] **Step 3: 集成测试**（`httptest` + 假 nginx）断言失败不覆盖文件。

- [ ] **Step 4: Commit**

`git commit -m "feat(panel): wire apply pipeline from API"`

---

### Task 8: CertMagic HTTP-01 与证书就绪门闩

**Files:**

- Create: `go-panel/internal/acme/service.go`
- Modify: `go-panel/internal/nginx/render.go`（`CertReady` 来源）

- [ ] **Step 1: 配置 CertMagic** `Cache` 指向 `CertsDir`，`ACMEAgree` true，`CA` staging 可切换。

- [ ] **Step 2: 在 Nginx 中** `alias` 与 CertMagic HTTP-01 使用 **同一** `AcmeChallengeDir`。

- [ ] **Step 3: `POST /api/v1/sites/{id}/certificate`** 触发 Obtain；成功后更新站点 `cert_ready` 列（需在迁移中加列），再重新 `Render`+`Apply`。

- [ ] **Step 4: 测试** 使用 **staging** + 可选项 **跳过** 集成（`t.Skip` 若无公网），单元测试 mock `Obtain` 接口。

- [ ] **Step 5: Commit**

`git commit -m "feat(panel): certmagic HTTP-01 and cert ready flag"`

---

### Task 9: 最小 Web UI（Go html/template）

**Files:**

- Create: `go-panel/web/templates/layout.html`
- Create: `go-panel/web/templates/sites.html`
- Create: `go-panel/internal/web/handlers.go`

- [ ] **Step 1:** `GET /` 重定向登录；`GET /sites` 表格 + CSRF 隐藏域（`gorilla/csrf` 或手写 token 存 session）。

- [ ] **Step 2:** 表单提交到同 API 或 server-side POST。

- [ ] **Step 3: Commit**

`git commit -m "feat(panel): minimal web UI for sites"`

---

### Task 10: `main`、systemd、README

**Files:**

- Create: `go-panel/cmd/panel/main.go`
- Create: `go-panel/README.md`

- [ ] **Step 1: `main.go`** 加载配置、`store.Open`、`chi` 挂载 API + 静态模板、Listen。

- [ ] **Step 2: README** 含：`useradd panel`、`sudoers` 示例（`panel ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /usr/sbin/nginx -s reload`）、`include /etc/nginx/panel.d/*.conf` 片段、环境变量表。

- [ ] **Step 3: `go build -o panel ./cmd/panel`** 成功。

- [ ] **Step 4: Commit**

`git commit -m "docs(panel): systemd, sudoers, and main entry"`

---

## Spec 覆盖自检

| 规格章节 | 对应 Task |
|----------|-----------|
| Nginx + 模板 + 丙路线 | 3,4,7 |
| HTTP-01 + alias | 3,8 |
| 证书未就绪仅 HTTP | 3,7,8 |
| nginx -t 门禁 | 4,7 |
| SQLite + 审计 | 2,7 |
| 单管理员 + session | 5,6,9 |
| REST + health | 6 |
| 测试策略 | 2–4,6–8 |
| 验收 1–4 | 贯穿 6–10 |

## 占位符扫描

本计划未使用 “TBD/TODO/稍后实现” 作为步骤替代；CertMagic 公网集成步骤已标注 `t.Skip` 条件，**不**作为模糊占位。

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-17-go-panel-mvp.md`.**

**说明：** Cursor 的 `/write-plan` 命令已标记弃用，后续请直接要求使用 **superpowers `writing-plans`** 技能生成计划。

**执行方式（二选一）：**

1. **Subagent-Driven（推荐）** — 按任务派发子代理、任务间评审、迭代快。需使用 **superpowers:subagent-driven-development**。

2. **Inline Execution** — 在本会话按 **superpowers:executing-plans** 顺序执行并设检查点。

你更倾向哪一种？
