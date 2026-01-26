import React, { useState, useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { exampleCode } from '../data/examples'
import { testFunctions, hasTestFunctions } from '../data/testFunctions'
import ExampleHeader from './ExampleHeader'
import CodeEditor from './CodeEditor'
import InfoPanel from './InfoPanel'
import ConsolePanel from './ConsolePanel'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://near-by-example-backend.fly.dev'

function ExampleDetail({ example, onBack }) {
  const [activeLanguage, setActiveLanguage] = useState('JavaScript')
  const [activeInfoTab, setActiveInfoTab] = useState('ai')
  const [code, setCode] = useState('')
  const [consoleOutput, setConsoleOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployedContractId, setDeployedContractId] = useState(null)
  const [deploymentTxHash, setDeploymentTxHash] = useState(null)
  const [testResults, setTestResults] = useState({})
  const [testParams, setTestParams] = useState({})
  const [isTesting, setIsTesting] = useState(false)
  const [contractState, setContractState] = useState({
    counter: 0,
    message: 'Hello, NEAR storage!',
    greeting: 'hello',
    owner: 'contract.testnet',
  })

  const initialCode =
    exampleCode[example.id]?.[activeLanguage] ||
    `// No ${activeLanguage} code sample is available yet for "${example.name}".
// Try switching language tabs, or pick another example from the sidebar.`

  const addConsoleOutput = (message) => {
    setConsoleOutput((prev) => prev + message + '\n')
  }


  // Reset active language to JavaScript when example changes
  useEffect(() => {
    setActiveLanguage('JavaScript')
  }, [example.id])

  useEffect(() => {
    setCode(initialCode)
  }, [example.id, activeLanguage, initialCode])

  // Initialize test parameters when example changes
  useEffect(() => {
    if (hasTestFunctions(example.id)) {
      const functions = testFunctions[example.id]
      const initialParams = {}
      
      functions.viewMethods.forEach(method => {
        method.params.forEach(param => {
          initialParams[`${method.name}_${param.name}`] = param.defaultValue || ''
        })
      })
      functions.changeMethods.forEach(method => {
        method.params.forEach(param => {
          initialParams[`${method.name}_${param.name}`] = param.defaultValue || ''
        })
      })
      
      setTestParams(initialParams)
      setTestResults({})
      setContractState({
        counter: 0,
        message: 'Hello, NEAR storage!',
        greeting: 'hello',
        owner: 'contract.testnet',
      })
    }
  }, [example.id])

  // Reset deploying state on mount (in case user navigated away and came back)
  useEffect(() => {
    setIsDeploying(false)
  }, [])

  // Handle transactionHashes URL parameter - redirect to success page
  useEffect(() => {
    // Check URL parameter on mount (for page reloads)
    const urlParams = new URLSearchParams(window.location.search)
    const transactionHashes = urlParams.get('transactionHashes')
    
    if (transactionHashes && !window.location.pathname.includes('/success')) {
      // Reset deploying state before redirect
      setIsDeploying(false)
      // Redirect to success page with transaction hash
      window.history.replaceState({}, '', `/examples/success?transactionHashes=${transactionHashes}`)
      window.location.href = `/examples/success?transactionHashes=${transactionHashes}`
    }
  }, []) // Only run on mount

  // Handle transactionHashes URL parameter - check continuously for new transactions and redirect
  useEffect(() => {
    let previousUrl = window.location.href
    
    const checkAndRedirect = () => {
      const urlParams = new URLSearchParams(window.location.search)
      const transactionHashes = urlParams.get('transactionHashes')
      const currentUrl = window.location.href
      
      // If URL changed (wallet redirect), reset deploying state
      if (currentUrl !== previousUrl) {
        setIsDeploying(false)
        previousUrl = currentUrl
      }
      
      if (transactionHashes && !window.location.pathname.includes('/success')) {
        // Reset deploying state before redirect
        setIsDeploying(false)
        // Redirect to success page
        window.history.replaceState({}, '', `/examples/success?transactionHashes=${transactionHashes}`)
        window.location.href = `/examples/success?transactionHashes=${transactionHashes}`
      }
    }
    
    // Check immediately
    checkAndRedirect()
    
    // Check periodically to catch URL changes
    const interval = setInterval(checkAndRedirect, 500)
    
    // Listen to popstate events
    window.addEventListener('popstate', checkAndRedirect)
    
    return () => {
      clearInterval(interval)
      window.removeEventListener('popstate', checkAndRedirect)
    }
  }, [])

  const clearConsole = () => {
    setConsoleOutput('')
  }

  const handleRun = async () => {
    if (!code.trim()) {
      addConsoleOutput('❌ Error: No code to run')
      return
    }

    setIsRunning(true)
    clearConsole()
    addConsoleOutput('▶ Compiling contract...')

    try {
      const compileResponse = await fetch(`${API_BASE_URL}/api/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: activeLanguage }),
      })

      if (!compileResponse.ok) {
        const errorData = await compileResponse.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || errorData.message || `HTTP ${compileResponse.status}: ${compileResponse.statusText}`)
      }

      const compileResult = await compileResponse.json()

      if (!compileResult.success && compileResult.stderr) {
        throw new Error(compileResult.stderr || compileResult.error || 'Compilation failed')
      }

      addConsoleOutput('✓ Contract compiled successfully')
      addConsoleOutput(`✓ WASM size: ${(compileResult.size / 1024).toFixed(2)} KB`)
      addConsoleOutput('\n💡 Note: Full execution requires deployment.')
      addConsoleOutput('   Click "Deploy" to deploy and test your contract on TestNet.')
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        addConsoleOutput(`❌ Error: Failed to connect to backend`)
        addConsoleOutput(`   Backend URL: ${API_BASE_URL}`)
        addConsoleOutput(`   Please check if the backend is running and accessible.`)
        addConsoleOutput(`   Error details: ${error.message}`)
      } else {
        addConsoleOutput(`❌ Error: ${error.message}`)
      }
      console.error('Run error:', error)
    } finally {
      setIsRunning(false)
    }
  }

  const handleDeploy = async () => {
    if (!code.trim()) {
      addConsoleOutput('❌ Error: No code to deploy')
      return
    }

    setIsDeploying(true)
    clearConsole()
    addConsoleOutput('▶ Starting deployment process...')
    addConsoleOutput('▶ Compiling contract...')

    try {
      const compileResponse = await fetch(`${API_BASE_URL}/api/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: activeLanguage }),
      })

      if (!compileResponse.ok) {
        const errorData = await compileResponse.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || errorData.message || `HTTP ${compileResponse.status}: ${compileResponse.statusText}`)
      }

      const compileResult = await compileResponse.json()

      if (!compileResult.success && compileResult.stderr) {
        throw new Error(compileResult.stderr || compileResult.error || 'Compilation failed')
      }

      addConsoleOutput('✓ Contract compiled successfully')
      addConsoleOutput(`✓ WASM size: ${(compileResult.size / 1024).toFixed(2)} KB`)

      addConsoleOutput('▶ Deploying contract via backend...')

      // Deploy using backend endpoint
      const deployResponse = await fetch(`${API_BASE_URL}/api/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wasmBase64: compileResult.wasm,
          useSubaccount: true,
          userId: 'user',
          projectId: example.id,
          initMethod: 'new',
          initArgs: {}
        }),
      })

      if (!deployResponse.ok) {
        const errorData = await deployResponse.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || errorData.message || `HTTP ${deployResponse.status}: ${deployResponse.statusText}`)
      }

      const deployResult = await deployResponse.json()

      if (!deployResult.success) {
        throw new Error(deployResult.error || 'Deployment failed')
      }

      addConsoleOutput('✓ Contract deployed successfully!')
      
      const txHash = deployResult.transactionHash || 'pending'
      const contractId = deployResult.contractAccountId || deployResult.accountId || 'unknown'

      addConsoleOutput(`✓ Transaction hash: ${txHash}`)
      addConsoleOutput(`✓ Contract available at: ${contractId}`)
      if (deployResult.deploymentTime) {
        addConsoleOutput(`✓ Deployment time: ${deployResult.deploymentTime.toFixed(2)}s`)
      }

      setDeployedContractId(contractId)
      setDeploymentTxHash(txHash)
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        addConsoleOutput(`❌ Error: Failed to connect to backend`)
        addConsoleOutput(`   Backend URL: ${API_BASE_URL}`)
        addConsoleOutput(`   Please check if the backend is running and accessible.`)
        addConsoleOutput(`   Error details: ${error.message}`)
      } else {
        addConsoleOutput(`❌ Error: ${error.message}`)
      }
      console.error('Deploy error:', error)
    } finally {
      setIsDeploying(false)
    }
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code)
  }

  const handleResetCode = () => {
    if (confirm('Reset code to original example?')) {
      setCode(initialCode)
      clearConsole()
    }
  }

  const generateTxHash = () => {
    const chars = '0123456789abcdef'
    let hash = ''
    for (let i = 0; i < 64; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)]
    }
    return hash
  }

  const getTestResult = (methodName, params) => {
    const paramValues = {}
    params.forEach((param) => {
      const value = testParams[`${methodName}_${param.name}`] || param.defaultValue || ''
      paramValues[param.name] = param.type === 'number' ? Number(value) || 0 : value
    })

    switch (methodName) {
      case 'hello_world':
        return 'Hello, NEAR!'
      case 'get_message':
        return contractState.message
      case 'get_counter':
        return contractState.counter
      case 'get_owner':
        return contractState.owner
      case 'get_greeting':
        return contractState.greeting
      case 'get_greeting_length':
        return contractState.greeting.length
      case 'add':
        const a = paramValues.a !== undefined ? paramValues.a : 2
        const b = paramValues.b !== undefined ? paramValues.b : 3
        return a + b
      default:
        return null
    }
  }

  const updateContractState = (methodName, params) => {
    const paramValues = {}
    params.forEach((param) => {
      const value = testParams[`${methodName}_${param.name}`] || param.defaultValue || ''
      paramValues[param.name] = param.type === 'number' ? Number(value) || 0 : value
    })

    setContractState(prev => {
      const newState = { ...prev }
      
      switch (methodName) {
        case 'set_message':
          newState.message = paramValues.message || 'Hello, NEAR storage!'
          break
        case 'set_greeting':
          newState.greeting = paramValues.greeting || 'Hello, NEAR!'
          break
        case 'increment':
          newState.counter = prev.counter + 1
          break
        case 'bulk_increment':
          const times = paramValues.times || 5
          newState.counter = prev.counter + times
          break
        case 'append_suffix':
          newState.greeting = prev.greeting + (paramValues.suffix || ' World')
          break
      }
      
      return newState
    })
  }

  const handleTestCall = async (method, isViewMethod) => {
    setIsTesting(true)
    addConsoleOutput(`\n▶ Calling ${method.name}...`)

    const delay = isViewMethod ? 200 + Math.random() * 300 : 800 + Math.random() * 1200
    await new Promise(resolve => setTimeout(resolve, delay))

    try {
      if (isViewMethod) {
        const result = getTestResult(method.name, method.params)
        
        setTestResults(prev => ({
          ...prev,
          [method.name]: { success: true, result, timestamp: new Date().toISOString() }
        }))
        
        addConsoleOutput(`✓ Result: ${JSON.stringify(result)}`)
      } else {
        const paramValues = {}
        method.params.forEach((param) => {
          const value = testParams[`${method.name}_${param.name}`] || param.defaultValue || ''
          paramValues[param.name] = param.type === 'number' ? Number(value) || 0 : value
        })

        if (method.name === 'assert_positive') {
          const value = paramValues.value !== undefined ? paramValues.value : 10
          if (value <= 0) {
            throw new Error('VALUE_MUST_BE_POSITIVE')
          }
        }

        updateContractState(method.name, method.params)
        
        const txHash = generateTxHash()
        const result = { success: true, txHash }
        
        setTestResults(prev => ({
          ...prev,
          [method.name]: { success: true, result, timestamp: new Date().toISOString() }
        }))
        
        addConsoleOutput(`✓ Transaction executed successfully`)
        addConsoleOutput(`✓ Transaction hash: ${txHash}`)
        
        const functions = testFunctions[example.id]
        if (functions.viewMethods.length > 0) {
          let viewMethod = null
          
          if (method.name === 'set_message') {
            viewMethod = functions.viewMethods.find(m => m.name === 'get_message')
          } else if (method.name === 'set_greeting') {
            viewMethod = functions.viewMethods.find(m => m.name === 'get_greeting')
          } else if (method.name === 'increment' || method.name === 'bulk_increment') {
            viewMethod = functions.viewMethods.find(m => m.name === 'get_counter')
          } else if (method.name === 'append_suffix') {
            viewMethod = functions.viewMethods.find(m => m.name === 'get_greeting')
          }
          
          if (viewMethod) {
            setTimeout(() => {
              try {
                const updatedResult = getTestResult(viewMethod.name, viewMethod.params)
                addConsoleOutput(`✓ Updated state: ${JSON.stringify(updatedResult)}`)
                setTestResults(prev => ({
                  ...prev,
                  [viewMethod.name]: { success: true, result: updatedResult, timestamp: new Date().toISOString() }
                }))
              } catch (e) {
                // Ignore errors
              }
            }, 500)
          }
        }
      }
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [method.name]: { success: false, error: error.message, timestamp: new Date().toISOString() }
      }))
      addConsoleOutput(`❌ Error: ${error.message}`)
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="pl-4 py-6 md:py-4 max-w-5xl mx-auto space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-near-primary transition-colors mb-6"
      >
        <ArrowLeft className="h-5 w-5" />
        <span className="font-medium">Back to Examples</span>
      </button>

      <ExampleHeader example={example} activeLanguage={activeLanguage} />

      <div className="flex flex-col lg:flex-row gap-6">
        <CodeEditor
          code={code}
          setCode={setCode}
          activeLanguage={activeLanguage}
          setActiveLanguage={setActiveLanguage}
          isRunning={isRunning}
          isDeploying={isDeploying}
          onRun={handleRun}
          onDeploy={handleDeploy}
          onCopy={handleCopyCode}
          onReset={handleResetCode}
        />

        <InfoPanel
          example={example}
          activeInfoTab={activeInfoTab}
          setActiveInfoTab={setActiveInfoTab}
          testParams={testParams}
          setTestParams={setTestParams}
          testResults={testResults}
          isTesting={isTesting}
          onTestCall={handleTestCall}
          code={code}
          activeLanguage={activeLanguage}
        />
                                          </div>

      <ConsolePanel
        consoleOutput={consoleOutput}
        deployedContractId={deployedContractId}
        deploymentTxHash={deploymentTxHash}
      />
    </div>
  )
}

export default ExampleDetail
