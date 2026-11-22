import { cache } from "react";
import { getSql } from "./db";
import { getCurrentUser } from "./dal";
import {
  enterable,
  resolveView,
  views,
  workspacesInView,
  SHARED_WORKSPACES,
  type View,
  type WorkspaceId,
} from "./workspace-calc";

export type WorkspaceContext = {
  /** What the person is looking at. */
  view: View;
  /** Every view they may switch to. */
  views: View[];
  /** The workspaces whose records this request shows. */
  inView: WorkspaceId[];
  /** Every workspace they may enter at all. */
  enterable: WorkspaceId[];
};

/**
 * The workspace context for this request. With nobody signed in (API keys, webhooks) it covers
 * Boring PE and Impact Marrow and never Personal.
 */
export const workspaceContext = cache(async (): Promise<WorkspaceContext> => {
  const user = await getCurrentUser();
  if (!user) return { view: "all", views: [], inView: [...SHARED_WORKSPACES], enterable: [...SHARED_WORKSPACES] };
  const view = resolveView(user.role, user.workspaces, user.current_workspace);
  return {
    view,
    views: views(user.role, user.workspaces),
    inView: workspacesInView(view, user.role, user.workspaces),
    enterable: enterable(user.role, user.workspaces),
  };
});

/** Ids of the active entities in the workspaces on view. */
export const entityIdsInView = cache(async (): Promise<string[]> => {
  const { inView } = await workspaceContext();
  const sql = await getSql();
  return (await sql.query<{ id: string }>("select id from entities where workspace = any($1::text[])", [inView])).map((r) => r.id);
});

/** Ids of entities in every workspace this person may enter: for links that cross workspaces. */
export const enterableEntityIds = cache(async (): Promise<string[]> => {
  const { enterable: can } = await workspaceContext();
  const sql = await getSql();
  return (await sql.query<{ id: string }>("select id from entities where workspace = any($1::text[])", [can])).map((r) => r.id);
});

/** True when an entity belongs to a workspace on view: the check every action makes before using an entity id. */
export async function entityInView(entityId: string | null | undefined): Promise<boolean> {
  if (!entityId) return false;
  return (await entityIdsInView()).includes(entityId);
}

/** The workspace a new record created now belongs to: the one on view, or Boring PE from the combined view. */
export async function workspaceForNew(): Promise<WorkspaceId> {
  const { view, enterable: can } = await workspaceContext();
  if (view !== "all") return view;
  return can.includes("boring_pe") ? "boring_pe" : can[0];
}

export async function setCurrentWorkspace(userId: string, view: View) {
  const sql = await getSql();
  await sql.query("update users set current_workspace = $2 where id = $1", [userId, view]);
}

export async function setMemberships(userId: string, workspaces: WorkspaceId[]) {
  const sql = await getSql();
  await sql.query("update users set workspaces = $2::text[] where id = $1", [userId, workspaces]);
}
