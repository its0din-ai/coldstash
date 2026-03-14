"use client";
import { useState } from "react";
import Modal from "./Modal";
import { api } from "@/lib/client-fetch";

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPw,  setOldPw]  = useState("");
  const [newPw,  setNewPw]  = useState("");
  const [error,  setError]  = useState("");
  const [ok,     setOk]     = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.post("/api/auth/change-password", { old_password: oldPw, new_password: newPw });
      setOk(true);
      setTimeout(onClose, 1200);
    } catch (err: any) {
      setError(err.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Change Password" onClose={onClose}>
      {ok ? (
        <p className="text-green text-sm text-center py-4">✓ Password updated successfully</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">Current Password</label>
            <input type="password" className="input-base" value={oldPw} onChange={e => setOldPw(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">New Password (min 8 chars)</label>
            <input type="password" className="input-base" value={newPw} onChange={e => setNewPw(e.target.value)} />
          </div>
          {error && <p className="text-danger text-xs">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Update"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
