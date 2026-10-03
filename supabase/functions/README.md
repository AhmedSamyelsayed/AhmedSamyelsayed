# Edge Functions

Server-side code that needs the service role. Deploy with
`supabase functions deploy send-invite` and set secrets with
`supabase secrets set APP_URL=https://figure.aseautomation.online APP_ORIGINS=https://figure.aseautomation.online`.

| Function      | Purpose                                                                      |
| ------------- | ---------------------------------------------------------------------------- |
| `send-invite` | Emails an invitation created by `create_invitation()` (invite or magic link) |

The service role key is injected by Supabase at runtime and never leaves the function.
