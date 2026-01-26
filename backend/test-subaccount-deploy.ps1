# Test subaccount deployment
# First build a contract, then deploy it to a subaccount

$env:NEAR_ACCOUNT_ID = "softquiche5250.testnet"
$env:NEAR_PRIVATE_KEY = "ed25519:4YUnd6qTdKcVgB5V1ZApjVKzMm2gwXtFTfAnABjFbm6vXGhQvpbNovaLqQTsE7wGTBtArYTazaRwqn9sd4txcAgr"
$env:NEAR_NETWORK = "testnet"

Write-Host "=== Step 1: Building Contract ==="
$buildBody = @{
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

$buildHeaders = @{
    "Content-Type" = "application/json"
}

try {
    $buildResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/compile" -Method Post -Body $buildBody -Headers $buildHeaders
    if ($buildResponse.success) {
        Write-Host "✅ Contract compiled successfully!"
        Write-Host "WASM Size: $($buildResponse.size) bytes"
        Write-Host ""
        
        Write-Host "=== Step 2: Deploying to Subaccount ==="
        $deployBody = @{
            wasmBase64 = $buildResponse.wasm
            useSubaccount = $true
            userId = "testuser"
            projectId = "testproj"
            initMethod = "new"
            initArgs = @{}
        } | ConvertTo-Json -Depth 10
        
        $deployResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/deploy" -Method Post -Body $deployBody -Headers $buildHeaders
        Write-Host "✅ Deployment result:"
        Write-Host ($deployResponse | ConvertTo-Json -Depth 10)
    } else {
        Write-Host "❌ Compilation failed:"
        Write-Host ($buildResponse | ConvertTo-Json)
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)"
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)"
    }
}
