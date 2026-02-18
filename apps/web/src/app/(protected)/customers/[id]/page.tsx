'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customersApi, type Customer } from '@/lib/api';
import { useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { hasPermission } from '@/lib/permissions';

export default function CustomerDetailsPage() {
  const { user } = useAuth();
  const canWriteCustomers = hasPermission(user, 'customers.write');
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const detailsQuery = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customersApi.get(id),
  });

  const activityQuery = useQuery({
    queryKey: ['customer', id, 'activity'],
    queryFn: () => customersApi.activity(id, 50),
  });

  const notesQuery = useQuery({
    queryKey: ['customer', id, 'notes'],
    queryFn: () => customersApi.notes(id),
  });

  const [noteText, setNoteText] = useState('');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'churned'>('active');
  const [editSegment, setEditSegment] = useState('');

  const createNoteMutation = useMutation({
    mutationFn: (content: string) => customersApi.createNote(id, content),
    onSuccess: () => {
      setNoteText('');
      queryClient.invalidateQueries({ queryKey: ['customer', id, 'notes'] });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) => customersApi.deleteNote(id, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id, 'notes'] });
    },
  });

  const updateCustomerMutation = useMutation({
    mutationFn: (body: { name: string; email: string; status: 'active' | 'churned'; segment?: string }) =>
      customersApi.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      setEditing(false);
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: () => customersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      router.push('/customers');
    },
  });

  const startEditing = () => {
    if (detailsQuery.data?.customer) {
      const c = detailsQuery.data.customer;
      setEditName(c.name);
      setEditEmail(c.email);
      setEditStatus(c.status);
      setEditSegment(c.segment ?? '');
      setEditing(true);
    }
  };

  if (detailsQuery.isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-gray-500 dark:text-slate-400">
        Loading customer…
      </div>
    );
  }

  if (detailsQuery.isError || !detailsQuery.data) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back
        </button>
        <p className="text-sm text-red-600">Failed to load customer.</p>
      </div>
    );
  }

  const { customer, healthScore, lastEventAt } = detailsQuery.data;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => router.back()}
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        ← Back to customers
      </button>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              {editing ? (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateCustomerMutation.mutate({
                      name: editName.trim(),
                      email: editEmail.trim(),
                      status: editStatus,
                      segment: editSegment.trim() || undefined,
                    });
                  }}
                >
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">
                      Status
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as 'active' | 'churned')}
                      className="w-full rounded-md border border-gray-300 dark:border-slate-600 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
                    >
                      <option value="active">Active</option>
                      <option value="churned">Churned</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">
                      Segment
                    </label>
                    <input
                      type="text"
                      value={editSegment}
                      onChange={(e) => setEditSegment(e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={updateCustomerMutation.isPending}
                      className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {updateCustomerMutation.isPending ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                  {updateCustomerMutation.isError && (
                    <p className="text-xs text-red-600">
                      {updateCustomerMutation.error instanceof Error
                        ? updateCustomerMutation.error.message
                        : 'Update failed'}
                    </p>
                  )}
                </form>
              ) : (
                <>
                  <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{customer.name}</h1>
                  <p className="text-sm text-gray-600 dark:text-slate-300">{customer.email}</p>
                  <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                    Segment: {customer.segment || '—'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    Status:{' '}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        customer.status === 'active'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {customer.status === 'active' ? 'Active' : 'Churned'}
                    </span>
                  </p>
                </>
              )}
            </div>
            {!editing && canWriteCustomers && (
              <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-start sm:gap-2">
                <div className="flex flex-col items-end gap-1">
                  <p className="text-xs text-gray-500">Health score</p>
                  <p className="text-2xl font-semibold text-gray-900">{healthScore}</p>
                  {lastEventAt && (
                    <p className="text-[11px] text-gray-500">
                      Last activity: {new Date(lastEventAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={startEditing}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Delete this customer? All notes and activity will be removed. This cannot be undone.')) {
                        deleteCustomerMutation.mutate();
                      }
                    }}
                    disabled={deleteCustomerMutation.isPending}
                    className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
                  >
                    {deleteCustomerMutation.isPending ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-2">Notes</h2>
            {canWriteCustomers ? (
              <form
                className="mb-3 flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!noteText.trim()) return;
                  createNoteMutation.mutate(noteText.trim());
                }}
              >
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Add a note about this customer…"
                  rows={2}
                />
                <button
                  type="submit"
                  disabled={createNoteMutation.isPending}
                  className="self-end sm:self-auto px-3 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createNoteMutation.isPending ? 'Saving…' : 'Add note'}
                </button>
              </form>
            ) : (
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Read-only access.</p>
            )}
            {notesQuery.isLoading && (
              <p className="text-xs text-gray-500">Loading notes…</p>
            )}
            {notesQuery.isError && (
              <p className="text-xs text-red-600">Failed to load notes.</p>
            )}
            {notesQuery.data && notesQuery.data.items.length === 0 && (
              <p className="text-xs text-gray-500">No notes yet.</p>
            )}
            <ul className="space-y-2">
              {notesQuery.data?.items.map((note) => (
                <li
                  key={note._id}
                  className="rounded-md border border-gray-200 px-3 py-2 text-sm flex items-start justify-between gap-2"
                >
                  <div>
                    <p className="text-gray-800">{note.content}</p>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {new Date(note.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {canWriteCustomers && (
                    <button
                      type="button"
                      onClick={() => deleteNoteMutation.mutate(note._id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Activity</h2>
          {activityQuery.isLoading && (
              <p className="text-xs text-gray-500 dark:text-slate-400">Loading activity…</p>
          )}
          {activityQuery.isError && (
              <p className="text-xs text-red-600">Failed to load activity.</p>
          )}
          {activityQuery.data && activityQuery.data.items.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-slate-400">No activity yet.</p>
          )}
          <ul className="space-y-2 text-xs">
            {activityQuery.data?.items.map((evt) => (
              <li key={evt._id} className="flex items-center justify-between">
                <span className="font-medium text-gray-800 capitalize">{evt.type}</span>
                <span className="text-gray-500">
                  {new Date(evt.timestamp).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
