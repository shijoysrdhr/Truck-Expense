import { login } from "../actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <>
      <h1>Owner login</h1>
      <form action={login} className="row" style={{ marginTop: 16 }}>
        <div>
          <label htmlFor="pw">Password</label>
          <input id="pw" name="password" type="password" autoFocus required />
        </div>
        <button>Log in</button>
      </form>
      {e ? <p className="loss">That password is not right. Try again.</p> : null}
    </>
  );
}
