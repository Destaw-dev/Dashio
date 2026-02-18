'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [profileName, setProfileName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user?.name !== undefined) setProfileName(user.name ?? '');
  }, [user?.name]);

  const updateProfileMutation = useMutation({
    mutationFn: (name: string) => authApi.updateProfile({ name: name.trim() || undefined }),
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'me'], data);
      setMessage({ type: 'success', text: 'Profile updated.' });
      setTimeout(() => setMessage(null), 3000);
    },
    onError: (err: Error) => {
      setMessage({ type: 'error', text: err.message });
      setTimeout(() => setMessage(null), 5000);
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setMessage({ type: 'success', text: 'Password updated.' });
      setTimeout(() => setMessage(null), 3000);
    },
    onError: (err: Error) => {
      setMessage({ type: 'error', text: err.message });
      setTimeout(() => setMessage(null), 5000);
    },
  });

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Profile & Settings</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Manage your account</p>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="card p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Profile</h2>
        <form
          className="space-y-3 mb-6"
          onSubmit={(e) => {
            e.preventDefault();
            updateProfileMutation.mutate(profileName);
          }}
        >
          <div>
            <label htmlFor="profile-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Email
            </label>
            <input
              id="profile-email"
              type="email"
              value={user?.email ?? ''}
              readOnly
              className="input-field cursor-not-allowed bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400"
            />
          </div>
          <div>
            <label htmlFor="profile-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Name
            </label>
            <input
              id="profile-name"
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Your name"
              className="input-field"
            />
          </div>
          <button type="submit" disabled={updateProfileMutation.isPending} className="btn-primary">
            {updateProfileMutation.isPending ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </div>

      <div className="card p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Change password</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!currentPassword.trim() || !newPassword.trim()) return;
            changePasswordMutation.mutate();
          }}
        >
          <div>
            <label htmlFor="current" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Current password
            </label>
            <input
              id="current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="new" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              New password
            </label>
            <input
              id="new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="input-field"
              placeholder="At least 8 characters"
            />
          </div>
          <button type="submit" disabled={changePasswordMutation.isPending} className="btn-primary">
            {changePasswordMutation.isPending ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
