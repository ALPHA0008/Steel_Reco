import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Users } from "lucide-react"
import { Page, PageHeader } from "@/components/app/page"
import { DataTable, type Column } from "@/components/app/data-table"
import { EmptyState } from "@/components/app/empty-state"
import { Banner } from "@/components/app/banner"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import {
  apiErrorMessage,
  deactivateAdminUser,
  fetchAdminUsers,
  reactivateAdminUser,
  type AdminUser,
} from "@/lib/api"

function formatDate(iso: string | null): string {
  if (!iso) return "Never"
  return new Date(iso).toLocaleString()
}

/**
 * Admin-only: every user across every project/site, with activation
 * controls. Role gating happens twice -- the server is the real guard
 * (RequireAdmin, 403 otherwise); this page also checks role client-side so a
 * non-admin never even sees the screen render before the API call fails.
 */
export function AdminUsersPage() {
  const { user: me } = useAuth()
  const queryClient = useQueryClient()
  const [pendingUser, setPendingUser] = useState<AdminUser | null>(null)
  const [actionPending, setActionPending] = useState(false)

  const users = useQuery({ queryKey: ["admin", "users"], queryFn: fetchAdminUsers })

  async function toggleActive(user: AdminUser) {
    setActionPending(true)
    try {
      if (user.is_active) {
        await deactivateAdminUser(user.id)
        toast.success(`${user.full_name} deactivated.`)
      } else {
        await reactivateAdminUser(user.id)
        toast.success(`${user.full_name} reactivated.`)
      }
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] })
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not update this account."))
    } finally {
      setActionPending(false)
      setPendingUser(null)
    }
  }

  if (me && me.role !== "admin") {
    return (
      <Page>
        <Banner variant="blocking">Admin access required.</Banner>
      </Page>
    )
  }

  const columns: Column<AdminUser>[] = [
    { key: "name", header: "Name", render: (r) => <span className="font-medium">{r.full_name}</span> },
    { key: "username", header: "Username", render: (r) => <span className="text-muted-foreground">@{r.username}</span> },
    { key: "project", header: "Project", render: (r) => r.project_name ?? "—" },
    {
      key: "role",
      header: "Role",
      render: (r) => (
        <Badge variant="secondary" className="font-medium capitalize">
          {r.role === "admin" ? "Admin" : "QS"}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) =>
        r.is_active ? (
          <Badge className="bg-success-subtle font-medium text-success">Active</Badge>
        ) : (
          <Badge className="bg-danger-subtle font-medium text-danger">Deactivated</Badge>
        ),
    },
    {
      key: "last_login",
      header: "Last login",
      render: (r) => <span className="text-muted-foreground">{formatDate(r.last_login_at)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) =>
        r.id === me?.id ? (
          <span className="text-xs text-muted-foreground">You</span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className={r.is_active ? "text-danger hover:text-danger" : undefined}
            onClick={() => setPendingUser(r)}
          >
            {r.is_active ? "Deactivate" : "Reactivate"}
          </Button>
        ),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Users"
        description="Every account across every project — monitor activity, deactivate, or restore access."
      />

      {users.isError && (
        <Banner variant="blocking" className="mb-4">
          {apiErrorMessage(users.error, "Could not load users.")}
        </Banner>
      )}

      <Card className="overflow-hidden py-0 shadow-(--shadow-card)">
        <DataTable
          columns={columns}
          rows={users.data ?? []}
          rowKey={(r) => r.id}
          loading={users.isLoading}
          empty={<EmptyState icon={<Users />} title="No users yet" />}
        />
      </Card>

      <ConfirmDialog
        open={pendingUser !== null}
        onOpenChange={(open) => !open && setPendingUser(null)}
        title={pendingUser?.is_active ? `Deactivate ${pendingUser.full_name}?` : `Reactivate ${pendingUser?.full_name}?`}
        description={
          pendingUser?.is_active
            ? "They will not be able to sign in until reactivated. Their data and history are kept."
            : "They will be able to sign in again immediately."
        }
        confirmLabel={pendingUser?.is_active ? "Deactivate" : "Reactivate"}
        destructive={pendingUser?.is_active}
        pending={actionPending}
        onConfirm={() => pendingUser && toggleActive(pendingUser)}
      />
    </Page>
  )
}
