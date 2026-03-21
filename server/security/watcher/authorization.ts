/**
 * Watcher Authorization — Role-based access control for real-time subscriptions.
 *
 * Controls which users can subscribe to task/project/agent update events,
 * based on their role and departmental boundaries.
 *
 * Roles (descending privilege):
 *   ceo          → full access to all resources
 *   team_leader  → own department's tasks and agents
 *   agent        → own tasks only (no project/agent subscriptions)
 */

export interface WatcherAuthorizationContext {
  userId: string;
  userRole: "ceo" | "team_leader" | "agent";
  departmentId: string | null;
  agentId: string | null;
}

export interface SubscriptionRequest {
  targetType: "task" | "project" | "agent";
  targetId: string;
  events: string[];
  /** Optional: department of the target resource (for cross-dept checks) */
  targetDepartmentId?: string | null;
  /** Optional: agent ID that owns the target task (for agent-level checks) */
  targetAgentId?: string | null;
}

export interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Determine whether a user may subscribe to a given resource's events.
 */
export function authorizeWatcherSubscription(
  ctx: WatcherAuthorizationContext,
  req: SubscriptionRequest,
): AuthorizationResult {
  // CEO has unrestricted access
  if (ctx.userRole === "ceo") {
    return { allowed: true };
  }

  // Team Leader: own department tasks and agents; no cross-department
  if (ctx.userRole === "team_leader") {
    if (req.targetType === "project") {
      // Team leaders can view projects they participate in
      return { allowed: true };
    }

    if (req.targetType === "task" || req.targetType === "agent") {
      if (req.targetDepartmentId && req.targetDepartmentId !== ctx.departmentId) {
        return {
          allowed: false,
          reason: `Team leader in department '${ctx.departmentId}' cannot subscribe to resources in department '${req.targetDepartmentId}'`,
        };
      }
      return { allowed: true };
    }
  }

  // Agent: own tasks only
  if (ctx.userRole === "agent") {
    if (req.targetType === "project") {
      return {
        allowed: false,
        reason: "Agents cannot subscribe to project-level events",
      };
    }

    if (req.targetType === "agent") {
      if (req.targetId !== ctx.agentId) {
        return {
          allowed: false,
          reason: "Agents can only subscribe to their own agent events",
        };
      }
      return { allowed: true };
    }

    if (req.targetType === "task") {
      if (req.targetAgentId && req.targetAgentId !== ctx.agentId) {
        return {
          allowed: false,
          reason: "Agents can only subscribe to tasks assigned to them",
        };
      }
      return { allowed: true };
    }
  }

  return { allowed: false, reason: "Unknown role or resource type" };
}

/**
 * Validate that a request does not attempt privilege escalation.
 * Returns an error reason if tampering is detected, or null if clean.
 */
export function detectPrivilegeEscalation(
  sessionCtx: WatcherAuthorizationContext,
  claimedRole?: string,
  claimedDepartmentId?: string,
): string | null {
  if (claimedRole && claimedRole !== sessionCtx.userRole) {
    return `Role escalation attempt: session role '${sessionCtx.userRole}' but claimed '${claimedRole}'`;
  }

  if (claimedDepartmentId && sessionCtx.departmentId && claimedDepartmentId !== sessionCtx.departmentId) {
    return `Department spoofing attempt: session dept '${sessionCtx.departmentId}' but claimed '${claimedDepartmentId}'`;
  }

  return null;
}
