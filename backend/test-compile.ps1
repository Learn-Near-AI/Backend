# Test contract compilation
$body = @{
    code = @"
use near_sdk::near;
use near_sdk::PanicOnDefault;

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self {}
    }
    
    pub fn hello_world(&self) -> String {
        "Hello, NEAR!".to_string()
    }
}
"@
    language = "Rust"
} | ConvertTo-Json

$headers = @{
    "Content-Type" = "application/json"
}

Write-Host "Testing backend compilation (no caching)..."
Write-Host "Sending request to http://localhost:3001/api/compile"
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/compile" -Method Post -Body $body -Headers $headers
    Write-Host "✅ Success! Compilation result:"
    Write-Host "Success: $($response.success)"
    Write-Host "WASM Size: $($response.size) bytes"
    Write-Host "Compilation Time: $($response.compilation_time) seconds"
    Write-Host "Cached: $($response.cached)"
    if ($response.stderr) {
        Write-Host "Stderr: $($response.stderr)"
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)"
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)"
    }
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody"
    }
}
