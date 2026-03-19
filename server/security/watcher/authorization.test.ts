/**
 * Watcher Authorization Tests
 * Mobile Inbox & Watcher機能の認可ロジック単体テスト
 */

import { describe, it, expect } from "vitest";
import {
  authorizeWatcherSubscription,
  detectPrivilegeEscalation,
  type WatcherAuthorizationContext,
  type SubscriptionRequest,
} from "./authorization.ts";

const ceoCtx: WatcherAuthorizationContext = {
  userId: "ceo-1",
  userRole: "ceo",
  departmentId: null,
  agentId: null,
};

const leaderCtx: WatcherAuthorizationContext = {
  userId: "leader-1",
  userRole: "team_leader",
  departmentId: "dev",
  agentId: "agent-leader-1",
};

const agentCtx: WatcherAuthorizationContext = {
  userId: "agent-1",
  userRole: "agent",
  departmentId: "dev",
  agentId: "agent-1",
};

describe("Watcher Authorization", () => {
  describe("CEO role", () => {
    it("should allow subscription to any task", () => {
      const req: SubscriptionRequest = {
        targetType: "task",
        targetId: "task-any",
        events: ["task_status_changed"],
        targetDepartmentId: "design",
      };
      const result = authorizeWatcherSubscription(ceoCtx, req);
      expect(result.allowed).toBe(true);
    });

    it("should allow subscription to any project", () => {
      const req: SubscriptionRequest = {
        targetType: "project",
        targetId: "project-secret",
        events: ["project_update"],
      };
      const result = authorizeWatcherSubscription(ceoCtx, req);
      expect(result.allowed).toBe(true);
    });

    it("should allow subscription to any agent", () => {
      const req: SubscriptionRequest = {
        targetType: "agent",
        targetId: "agent-other",
        events: ["agent_status_changed"],
        targetDepartmentId: "qa",
      };
      const result = authorizeWatcherSubscription(ceoCtx, req);
      expect(result.allowed).toBe(true);
    });
  });

  describe("Team Leader role", () => {
    it("should allow subscription to own department tasks", () => {
      const req: SubscriptionRequest = {
        targetType: "task",
        targetId: "task-dev-1",
        events: ["task_status_changed"],
        targetDepartmentId: "dev",
      };
      const result = authorizeWatcherSubscription(leaderCtx, req);
      expect(result.allowed).toBe(true);
    });

    it("should deny subscription to cross-department tasks", () => {
      const req: SubscriptionRequest = {
        targetType: "task",
        targetId: "task-design-1",
        events: ["task_status_changed"],
        targetDepartmentId: "design",
      };
      const result = authorizeWatcherSubscription(leaderCtx, req);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("cannot subscribe");
    });

    it("should allow subscription to own department agents", () => {
      const req: SubscriptionRequest = {
        targetType: "agent",
        targetId: "agent-dev-2",
        events: ["agent_status_changed"],
        targetDepartmentId: "dev",
      };
      const result = authorizeWatcherSubscription(leaderCtx, req);
      expect(result.allowed).toBe(true);
    });

    it("should allow subscription to projects", () => {
      const req: SubscriptionRequest = {
        targetType: "project",
        targetId: "project-1",
        events: ["project_update"],
      };
      const result = authorizeWatcherSubscription(leaderCtx, req);
      expect(result.allowed).toBe(true);
    });
  });

  describe("Agent role", () => {
    it("should allow subscription only to own tasks", () => {
      const req: SubscriptionRequest = {
        targetType: "task",
        targetId: "task-1",
        events: ["task_status_changed"],
        targetAgentId: "agent-1",
      };
      const result = authorizeWatcherSubscription(agentCtx, req);
      expect(result.allowed).toBe(true);
    });

    it("should deny subscription to other agents' tasks", () => {
      const req: SubscriptionRequest = {
        targetType: "task",
        targetId: "task-other",
        events: ["task_status_changed"],
        targetAgentId: "agent-other",
      };
      const result = authorizeWatcherSubscription(agentCtx, req);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("assigned to them");
    });

    it("should deny subscription to projects", () => {
      const req: SubscriptionRequest = {
        targetType: "project",
        targetId: "project-1",
        events: ["project_update"],
      };
      const result = authorizeWatcherSubscription(agentCtx, req);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("project-level");
    });

    it("should deny subscription to other agents", () => {
      const req: SubscriptionRequest = {
        targetType: "agent",
        targetId: "agent-other",
        events: ["agent_status_changed"],
      };
      const result = authorizeWatcherSubscription(agentCtx, req);
      expect(result.allowed).toBe(false);
    });

    it("should allow subscription to own agent events", () => {
      const req: SubscriptionRequest = {
        targetType: "agent",
        targetId: "agent-1",
        events: ["agent_status_changed"],
      };
      const result = authorizeWatcherSubscription(agentCtx, req);
      expect(result.allowed).toBe(true);
    });
  });

  describe("Privilege escalation prevention", () => {
    it("should reject role modification in request", () => {
      const result = detectPrivilegeEscalation(agentCtx, "ceo");
      expect(result).not.toBeNull();
      expect(result).toContain("Role escalation");
    });

    it("should reject department ID spoofing", () => {
      const result = detectPrivilegeEscalation(leaderCtx, undefined, "design");
      expect(result).not.toBeNull();
      expect(result).toContain("Department spoofing");
    });

    it("should pass when claims match session", () => {
      const result = detectPrivilegeEscalation(leaderCtx, "team_leader", "dev");
      expect(result).toBeNull();
    });

    it("should pass when no claims are made", () => {
      const result = detectPrivilegeEscalation(agentCtx);
      expect(result).toBeNull();
    });
  });
});
