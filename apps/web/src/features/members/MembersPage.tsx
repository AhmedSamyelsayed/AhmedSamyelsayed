import { PERMISSIONS, ROLES, ROLE_DEFAULT_PERMISSIONS, type Role } from '@figure/shared';
import { KeyRound, Trash2, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormMessage } from '@/components/FormMessage';
import { PageHeader } from '@/components/PageHeader';
import { QueryState } from '@/components/QueryState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Table, Td, Th } from '@/components/ui/table';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCompany } from '@/features/company/CompanyProvider';
import { useCan } from '@/features/company/useCan';
import { friendlyError } from '@/lib/errors';
import { useFormatDate } from '@/lib/useDate';
import {
  membersApi,
  useMemberMutation,
  useMembers,
  useOverrides,
  usePendingInvitations,
  type Member,
} from './api';
import { InviteDialog } from './InviteDialog';

export function MembersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { active } = useCompany();
  const can = useCan();
  const formatDate = useFormatDate();
  const members = useMembers();
  const invitations = usePendingInvitations();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [permissionsFor, setPermissionsFor] = useState<Member | null>(null);
  const update = useMemberMutation(membersApi.updateMember);
  const remove = useMemberMutation(membersApi.removeMember);
  const revoke = useMemberMutation(membersApi.revokeInvitation);
  const manage = can('users.manage');
  const iAmOwner = active?.role === 'company_owner';
  const mutationError = update.error ?? remove.error ?? revoke.error;

  // UI mirror of the database guard rules.
  const editable = (m: Member) =>
    manage && m.user_id !== user?.id && (iAmOwner || m.role !== 'company_owner');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={t('members.title')}
        description={t('members.description')}
        actions={
          manage && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" aria-hidden />
              {t('members.invite')}
            </Button>
          )
        }
      />
      <FormMessage kind="error" text={mutationError ? friendlyError(mutationError, t) : null} />
      <QueryState loading={members.isLoading} error={members.error}>
        <Table>
          <thead>
            <tr>
              <Th>{t('members.name')}</Th>
              <Th>{t('auth.email')}</Th>
              <Th>{t('members.role')}</Th>
              <Th>{t('members.status')}</Th>
              <Th>{t('members.lastSignIn')}</Th>
              {manage && <Th className="w-28" />}
            </tr>
          </thead>
          <tbody>
            {members.data?.map((m) => (
              <tr key={m.user_id}>
                <Td>
                  {m.full_name || '—'}
                  {m.user_id === user?.id && <Badge className="ms-2">{t('members.you')}</Badge>}
                </Td>
                <Td dir="ltr" className="text-start">
                  {m.email}
                </Td>
                <Td>
                  {editable(m) ? (
                    <Select
                      aria-label={t('members.role')}
                      className="h-9"
                      value={m.role}
                      onChange={(e) =>
                        update.mutate({ userId: m.user_id, role: e.target.value as Role })
                      }
                    >
                      {ROLES.filter((r) => iAmOwner || r !== 'company_owner').map((r) => (
                        <option key={r} value={r}>
                          {t(`roles.${r}`)}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    t(`roles.${m.role}`)
                  )}
                </Td>
                <Td>
                  {editable(m) ? (
                    <Select
                      aria-label={t('members.status')}
                      className="h-9"
                      value={m.status}
                      onChange={(e) =>
                        update.mutate({
                          userId: m.user_id,
                          status: e.target.value as Member['status'],
                        })
                      }
                    >
                      <option value="active">{t('members.statusActive')}</option>
                      <option value="suspended">{t('members.statusSuspended')}</option>
                    </Select>
                  ) : (
                    <Badge tone={m.status === 'active' ? 'success' : 'warn'}>
                      {t(
                        m.status === 'active' ? 'members.statusActive' : 'members.statusSuspended',
                      )}
                    </Badge>
                  )}
                </Td>
                <Td>{formatDate(m.last_sign_in_at)}</Td>
                {manage && (
                  <Td className="whitespace-nowrap">
                    {editable(m) && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('members.permissions')}
                          title={t('members.permissions')}
                          onClick={() => setPermissionsFor(m)}
                        >
                          <KeyRound className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('members.remove')}
                          onClick={() =>
                            window.confirm(t('members.confirmRemove', { email: m.email })) &&
                            remove.mutate(m.user_id)
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    )}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      </QueryState>

      {manage && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">{t('members.pending')}</h2>
          <QueryState loading={invitations.isLoading} error={invitations.error}>
            {invitations.data?.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>{t('auth.email')}</Th>
                    <Th>{t('members.role')}</Th>
                    <Th>{t('members.expires')}</Th>
                    <Th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {invitations.data.map((i) => (
                    <tr key={i.id}>
                      <Td dir="ltr" className="text-start">
                        {i.email}
                      </Td>
                      <Td>{t(`roles.${i.role}`)}</Td>
                      <Td>{formatDate(i.expires_at)}</Td>
                      <Td>
                        {(iAmOwner || i.role !== 'company_owner') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t('members.revoke')}
                            title={t('members.revoke')}
                            onClick={() => revoke.mutate(i.id)}
                          >
                            <X className="size-4" />
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">{t('members.noPending')}</p>
            )}
          </QueryState>
        </section>
      )}

      {inviteOpen && <InviteDialog open onClose={() => setInviteOpen(false)} />}
      {permissionsFor && (
        <PermissionsDialog member={permissionsFor} onClose={() => setPermissionsFor(null)} />
      )}
    </div>
  );
}

function PermissionsDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const { t } = useTranslation();
  const can = useCan();
  const overrides = useOverrides(member.user_id);
  const setOverride = useMemberMutation(membersApi.setOverride);
  const defaults = new Set<string>(ROLE_DEFAULT_PERMISSIONS[member.role]);
  const stateOf = (p: string) => {
    const o = overrides.data?.find((x) => x.permission === p);
    return o ? (o.granted ? 'grant' : 'revoke') : 'inherit';
  };

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={t('members.permissionsFor', { name: member.full_name || member.email })}
    >
      <p className="mb-4 text-sm text-muted-foreground">{t('members.permissionsHint')}</p>
      <FormMessage
        kind="error"
        text={setOverride.error ? friendlyError(setOverride.error, t) : null}
      />
      <QueryState loading={overrides.isLoading} error={overrides.error}>
        <Table>
          <thead>
            <tr>
              <Th>{t('members.permission')}</Th>
              <Th>{t('members.roleDefault')}</Th>
              <Th>{t('members.override')}</Th>
              <Th>{t('members.effective')}</Th>
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => {
              const state = stateOf(p);
              const effective = state === 'inherit' ? defaults.has(p) : state === 'grant';
              return (
                <tr key={p}>
                  <Td>
                    <span className="block">{t(`permissions.${p.replace('.', '_')}`)}</span>
                    <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                      {p}
                    </span>
                  </Td>
                  <Td>{defaults.has(p) ? '✓' : '—'}</Td>
                  <Td>
                    <Select
                      className="h-9"
                      aria-label={p}
                      value={state}
                      disabled={setOverride.isPending || !can(p)}
                      onChange={(e) =>
                        setOverride.mutate({
                          userId: member.user_id,
                          permission: p,
                          state: e.target.value as 'inherit' | 'grant' | 'revoke',
                        })
                      }
                    >
                      <option value="inherit">{t('members.inherit')}</option>
                      <option value="grant">{t('members.grant')}</option>
                      <option value="revoke">{t('members.revokePerm')}</option>
                    </Select>
                  </Td>
                  <Td>
                    {effective ? (
                      <Badge tone="success">{t('members.allowed')}</Badge>
                    ) : (
                      <Badge>{t('members.denied')}</Badge>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </QueryState>
    </Dialog>
  );
}
