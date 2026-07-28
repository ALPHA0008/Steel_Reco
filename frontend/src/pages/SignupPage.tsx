import { useEffect, useState, type FormEvent } from "react"
import { Link, Navigate, useNavigate } from "react-router-dom"
import { TriangleAlert } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { apiErrorMessage, fetchProjectsForSignup, type ProjectPicker } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Wordmark } from "@/landing/components/Wordmark"

export function SignupPage() {
  const { user, signup } = useAuth()
  const navigate = useNavigate()

  const [projects, setProjects] = useState<ProjectPicker[]>([])
  const [projectsError, setProjectsError] = useState(false)
  const [projectId, setProjectId] = useState("")
  const [signupCode, setSignupCode] = useState("")
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchProjectsForSignup()
      .then(setProjects)
      .catch(() => setProjectsError(true))
  }, [])

  if (user) return <Navigate to="/dashboard" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signup({
        username,
        email,
        password,
        full_name: fullName,
        project_id: projectId,
        signup_code: signupCode,
      })
      navigate("/dashboard", { replace: true })
    } catch (err) {
      setError(apiErrorMessage(err, "Could not create your account. Check your details and try again."))
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit =
    !submitting && username && email && password.length >= 8 && fullName && projectId && signupCode

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <Link to="/" className="inline-block transition-opacity hover:opacity-75" aria-label="Back to the Digi Reco site">
            <Wordmark className="text-[34px] text-foreground" />
          </Link>
          <p className="mt-2 text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
            Steel Reconciliation Tool
          </p>
        </div>

        <Card className="stagger-in shadow-(--shadow-card)">
          <CardContent className="p-7">
            <h1 className="text-[19px] font-semibold tracking-tight text-foreground">Create your account</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Ask your site admin for your project's signup code.
            </p>
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
                <Label htmlFor="project">Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger id="project" className="w-full">
                    <SelectValue placeholder={projectsError ? "Could not load projects" : "Select your project"} />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signupCode">Signup code</Label>
                <Input
                  id="signupCode"
                  required
                  value={signupCode}
                  onChange={(e) => setSignupCode(e.target.value)}
                  placeholder="Given to you by your admin"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              </div>

              <Button
                type="submit"
                disabled={!canSubmit}
                className="w-full bg-brand text-brand-foreground hover:bg-brand-hover"
              >
                {submitting ? "Creating account…" : "Create account"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-foreground underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
