"use client";

import { useState } from "react";
import { Button } from "@gshl-ui";
import { useAuthUserAdmin, useUpdateAuthUserAccess } from "@gshl-hooks";
import type {
  AppRole,
  AuthOwnerOption,
  AuthUser,
  UserStatus,
} from "@gshl-lib/auth/types";

function UserAccessRow({
  user,
  owners,
}: {
  user: AuthUser;
  owners: AuthOwnerOption[];
}) {
  const [role, setRole] = useState<AppRole>(user.role);
  const [status, setStatus] = useState<UserStatus>(user.status);
  const [ownerId, setOwnerId] = useState(user.ownerId ?? "");
  const update = useUpdateAuthUserAccess();
  const canHaveOwnerLink = role === "owner" || role === "commissioner";

  return (
    <tr className="border-b align-top">
      <td className="px-2 py-3">
        <div className="font-semibold">{user.name ?? "Unnamed user"}</div>
        <div className="text-xs text-muted-foreground">{user.email}</div>
      </td>
      <td className="px-2 py-3">
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as AppRole)}
          className="rounded border bg-white px-2 py-1"
        >
          <option value="viewer">Viewer</option>
          <option value="owner">Owner</option>
          <option value="commissioner">Commissioner</option>
        </select>
      </td>
      <td className="px-2 py-3">
        <select
          value={ownerId}
          disabled={!canHaveOwnerLink}
          onChange={(event) => setOwnerId(event.target.value)}
          className="max-w-52 rounded border bg-white px-2 py-1 disabled:opacity-50"
        >
          <option value="">Select owner</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.firstName} {owner.nickName ? `“${owner.nickName}” ` : ""}
              {owner.lastName}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-3">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as UserStatus)}
          className="rounded border bg-white px-2 py-1"
        >
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </td>
      <td className="px-2 py-3">
        <Button
          size="sm"
          disabled={update.isPending || (role === "owner" && !ownerId)}
          onClick={() =>
            update.mutate({
              id: user.id,
              role,
              status,
              ownerId: canHaveOwnerLink && ownerId ? ownerId : undefined,
            })
          }
        >
          {update.isPending ? "Saving…" : "Save"}
        </Button>
        {update.error ? (
          <p className="mt-1 max-w-52 text-xs text-red-600">
            {update.error.message}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

export function UserManagement() {
  const { users, owners } = useAuthUserAdmin();

  if (users.isLoading || owners.isLoading) {
    return <div className="p-8 text-center">Loading user access…</div>;
  }
  if (users.error || owners.error) {
    return (
      <div className="p-8 text-center text-red-600">
        User administration could not be loaded.
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-6xl overflow-x-auto py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">User Access</h1>
        <p className="text-sm text-muted-foreground">
          New Google accounts begin as viewers. Owners require one linked league
          owner record; commissioners can optionally link their owner record too.
        </p>
      </div>
      <table className="w-full min-w-[780px] text-sm">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="px-2 py-2">Account</th>
            <th className="px-2 py-2">Role</th>
            <th className="px-2 py-2">Owner link</th>
            <th className="px-2 py-2">Status</th>
            <th className="px-2 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {(users.data ?? []).map((user) => (
            <UserAccessRow key={user.id} user={user} owners={owners.data ?? []} />
          ))}
        </tbody>
      </table>
    </section>
  );
}
