import { useState, type FormEvent } from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { TriangleAlert } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { apiErrorMessage } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Wordmark } from "@/landing/components/Wordmark"

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Where to go once authenticated: back to the protected page the guard
  // bounced us from, otherwise into the tool (never back to the landing page).
  const from = (location.state as { from?: string } | null)?.from
  const target = from && from !== "/" ? from : "/dashboard"

  if (user) return <Navigate to={target} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
      navigate(target, { replace: true })
    } catch (err) {
      setError(apiErrorMessage(err, "Incorrect username or password."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <Wordmark className="text-[34px] text-foreground" />
          <p className="mt-2 text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
            Steel Reconciliation Tool
          </p>
        </div>

        <Card className="shadow-(--shadow-card)">
          <CardContent className="p-7">
            <h1 className="text-[19px] font-semibold tracking-tight text-foreground">Sign in</h1>
            <form onSubmit={onSubmit} className="mt-6 space-y-5" noValidate>
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-subtle px-3 py-2.5 text-[13px] font-medium text-danger"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  autoFocus
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                disabled={submitting || !username || !password}
                className="w-full bg-brand text-brand-foreground hover:bg-brand-hover"
              >
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Steel reconciliation for My Home Constructions projects.
        </p>
      </div>
    </div>
  )
}
