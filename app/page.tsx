import { redirect } from 'next/navigation'

// The root URL just sends people to the dashboard. If they are not
// logged in, the middleware bounces them to /login first.
export default function Home() {
  redirect('/dashboard')
}
