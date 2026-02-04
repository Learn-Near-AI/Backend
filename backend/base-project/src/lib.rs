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
