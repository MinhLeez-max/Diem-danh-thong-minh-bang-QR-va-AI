import { useLayoutEffect, type ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

type Props = {
  children: ReactNode;
};

export default function ClerkApiTokenBridge({ children }: Props) {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useLayoutEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setAuthTokenGetter(null);
      return;
    }

    setAuthTokenGetter(() => getToken());

    return () => {
      setAuthTokenGetter(null);
    };
  }, [isLoaded, isSignedIn, getToken]);

  if (!isLoaded) {
    return (
      <main className="page-wrap">
        <div className="loading-row">Đang khởi tạo đăng nhập…</div>
      </main>
    );
  }

  return <>{children}</>;
}