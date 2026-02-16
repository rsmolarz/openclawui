import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cpu, Shield } from "lucide-react";

export default function LoginPage() {
  const handleLogin = () => {
    window.location.href = "/api/auth/medinvest/start";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-md bg-primary">
              <Cpu className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl" data-testid="text-login-title">OpenClaw Dashboard</CardTitle>
            <CardDescription className="mt-2" data-testid="text-login-description">
              Sign in to manage your AI agent gateway settings
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleLogin}
            className="w-full gap-2"
            size="lg"
            data-testid="button-login-medinvest"
          >
            <Shield className="h-5 w-5" />
            Sign in with OpenClaw MedInvest DID
          </Button>
          <p className="text-xs text-center text-muted-foreground" data-testid="text-login-info">
            Authenticate securely using your MedInvest Decentralized Identity
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
