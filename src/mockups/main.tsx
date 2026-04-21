import type { CSSProperties, ReactElement } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  ArchiveIcon,
  CloseIcon,
  DeleteIcon,
  DotsIcon,
  PlusIcon,
  PromptIcon
} from "../content/lib/icons";
import "./styles.css";

type MockDepthStyle = CSSProperties & {
  "--depth": number;
};

const conversations = [
  { title: "Dual-Agent Loop", state: "selected" },
  { title: "Gemma 4 互联网接入方法", state: "hover" },
  { title: "Git本地忽略文件方法", state: "default" },
  { title: "开源Chrome扩展设计建议", state: "selected" },
  { title: "Codex agent区别", state: "default" },
  { title: "OpenClaw 代码开发指南", state: "default" },
  { title: "Daily AI news", state: "default" },
  { title: "AI总结 YouTube视频工具", state: "default" }
];

const prompts = [
  {
    title: "Review this change",
    body: "Review the diff for correctness, regressions, and missing tests."
  },
  {
    title: "Summarize long thread",
    body: "Summarize decisions, open questions, and concrete next actions."
  },
  {
    title: "Write implementation plan",
    body: "Create a concise implementation plan with files, risks, and validation."
  }
];

function SidebarMockup(): ReactElement {
  return (
    <aside className="mock-sidebar">
      <div className="mock-sidebar-top">
        <div className="mock-logo" />
        <button className="mock-icon-button" aria-label="Toggle sidebar" type="button" />
      </div>
      <nav className="mock-primary-nav">
        <span>New chat</span>
        <span>Search chats</span>
        <span>Projects</span>
        <span>Codex</span>
      </nav>
      <div className="mock-recents-label">Recents</div>
      <div className="mock-action-bar" role="toolbar" aria-label="Selected conversation actions">
        <span>2</span>
        <button aria-label="Delete selected" type="button">
          <DeleteIcon />
        </button>
        <button aria-label="Archive selected" type="button">
          <ArchiveIcon />
        </button>
        <button aria-label="More actions" type="button">
          <DotsIcon />
        </button>
        <div className="mock-more-menu">Open native Archive</div>
      </div>
      <div className="mock-conversation-list">
        {conversations.map((conversation) => (
          <div
            className="mock-conversation-row"
            data-state={conversation.state}
            key={conversation.title}
          >
            <span className="mock-checkbox" />
            <span>{conversation.title}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function PromptDropdownMockup(): ReactElement {
  return (
    <div className="mock-prompt-dropdown">
      <div className="mock-prompt-items">
        {prompts.map((prompt, index) => (
          <div className="mock-prompt-row" data-active={index === 0} key={prompt.title}>
            <span>
              <strong>{prompt.title}</strong>
              <small>{prompt.body}</small>
            </span>
            <button aria-label={`Delete ${prompt.title}`} type="button">
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>
      <button className="mock-save-prompt" type="button">
        <PlusIcon />
        Save current input as prompt
      </button>
    </div>
  );
}

function MainMockup(): ReactElement {
  return (
    <main className="mock-main">
      <header className="mock-topbar">
        <button type="button">ChatGPT</button>
        <div>
          <button type="button">Share</button>
          <button aria-label="More" type="button">
            <DotsIcon />
          </button>
        </div>
      </header>
      <article className="mock-thread">
        <section>
          <h2>Step 2（半自动）</h2>
          <p>写一个简单 runner:</p>
          <ul>
            <li>自动调用模型</li>
            <li>自动跑 test</li>
            <li>自动 loop</li>
          </ul>
        </section>
        <section>
          <h2>Step 3（进阶）</h2>
          <p>用 OpenDevin 改造:</p>
          <ul>
            <li>接 Qwen（本地）</li>
            <li>接 Codex（云）</li>
            <li>加 termination logic</li>
          </ul>
        </section>
        <section>
          <h2>最后一句话总结</h2>
          <p>OpenDevin 可以作为循环引擎，实现结对编程 loop。</p>
          <pre>{`npm run test\nnpm run build`}</pre>
        </section>
      </article>
      <div className="mock-composer-wrap">
        <PromptDropdownMockup />
        <div className="mock-composer">
          <button aria-label="Attach" type="button">
            <PlusIcon />
          </button>
          <button className="mock-prompt-trigger" aria-label="Saved prompts" type="button">
            <PromptIcon />
          </button>
          <span>Type / for Prompts</span>
          <button aria-label="Voice" type="button" />
        </div>
      </div>
    </main>
  );
}

function OutlineMockup(): ReactElement {
  const items = [
    { label: "Step 2（半自动）", level: 1, active: false, kind: "heading" },
    { label: "runner", level: 2, active: false, kind: "heading" },
    { label: "Step 3（进阶）", level: 1, active: true, kind: "heading" },
    { label: "OpenDevin 改造", level: 2, active: false, kind: "heading" },
    { label: "最后一句话总结", level: 1, active: false, kind: "heading" },
    { label: "Code block", level: 3, active: false, kind: "code" }
  ];

  return (
    <aside className="mock-outline" aria-label="Conversation outline">
      {items.map((item) => (
        <button
          className="mock-outline-item"
          data-active={item.active}
          data-kind={item.kind}
          key={item.label}
          style={{ "--depth": item.level } as MockDepthStyle}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </aside>
  );
}

function ComponentBreakdown(): ReactElement {
  return (
    <section className="component-breakdown">
      <h2>Component states</h2>
      <div className="component-grid">
        <div className="component-card">
          <h3>Checkbox</h3>
          <div className="state-row">
            <span className="state-label">Hidden</span>
            <span className="mock-checkbox demo-hidden" />
          </div>
          <div className="state-row">
            <span className="state-label">Hover</span>
            <span className="mock-checkbox demo-visible" />
          </div>
          <div className="state-row">
            <span className="state-label">Selected</span>
            <span className="mock-checkbox demo-selected" />
          </div>
        </div>
        <div className="component-card">
          <h3>Action bar</h3>
          <div className="mock-action-bar demo-bar">
            <span>3</span>
            <button aria-label="Delete selected" type="button">
              <DeleteIcon />
            </button>
            <button aria-label="Archive selected" type="button">
              <ArchiveIcon />
            </button>
            <button aria-label="More actions" type="button">
              <DotsIcon />
            </button>
          </div>
        </div>
        <div className="component-card wide">
          <h3>Prompt dropdown</h3>
          <PromptDropdownMockup />
        </div>
        <div className="component-card">
          <h3>Outline item</h3>
          <button className="mock-outline-item demo-outline" data-active="false" type="button">
            Default
          </button>
          <button className="mock-outline-item demo-outline" data-active="true" type="button">
            Active in viewport
          </button>
          <button className="mock-outline-item demo-outline" data-kind="code" type="button">
            Code block
          </button>
        </div>
      </div>
    </section>
  );
}

function MockupApp(): ReactElement {
  return (
    <>
      <section className="mockup-frame" aria-label="Desktop UI mockup">
        <SidebarMockup />
        <MainMockup />
        <OutlineMockup />
      </section>
      <ComponentBreakdown />
    </>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <MockupApp />
  </StrictMode>
);
