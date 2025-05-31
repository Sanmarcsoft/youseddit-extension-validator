/**
 * C2PA Extension UAT Test Runner
 * Automated test execution script for basic validation
 */

// Test configuration
const TEST_CONFIG = {
    testImages: [
        './media/cards_trusted.jpg',
        './media/cards_trusted.png', 
        './media/cards_trusted.webp',
        './media/cards_untrusted.jpg',
        './media/cards_invalid.jpg',
        './media/cards.jpg' // non-C2PA control
    ],
    expectedResults: {
        'cards_trusted.jpg': 'success',
        'cards_trusted.png': 'success', 
        'cards_trusted.webp': 'success',
        'cards_untrusted.jpg': 'warning',
        'cards_invalid.jpg': 'error',
        'cards.jpg': 'none'
    },
    timeout: 5000 // 5 seconds per test
};

// Test results tracker
let testResults = {
    passed: 0,
    failed: 0,
    total: 0,
    details: []
};

/**
 * Main test execution function
 */
async function runUATTests() {
    console.log('🔒 Starting C2PA Extension UAT Tests');
    console.log('==========================================');
    
    // Check if extension is loaded
    if (!chrome || !chrome.runtime) {
        console.error('❌ Chrome extension APIs not available');
        return false;
    }

    try {
        // Test 1: Extension Communication
        await testExtensionCommunication();
        
        // Test 2: C2PA Detection on Test Images
        await testC2PADetection();
        
        // Test 3: Trust List Validation
        await testTrustListValidation();
        
        // Test 4: Performance Metrics
        await testPerformanceMetrics();
        
        // Generate test report
        generateTestReport();
        
    } catch (error) {
        console.error('❌ Test execution failed:', error);
        return false;
    }
    
    return testResults.failed === 0;
}

/**
 * Test 1: Verify extension communication
 */
async function testExtensionCommunication() {
    console.log('\n📡 Test 1: Extension Communication');
    
    try {
        const response = await chrome.runtime.sendMessage({ action: 'MSG_GET_ID' });
        
        if (response && response.tab) {
            logTestResult('Extension Communication', true, 'Extension responds to messages');
        } else {
            logTestResult('Extension Communication', false, 'No response from extension');
        }
    } catch (error) {
        logTestResult('Extension Communication', false, `Error: ${error.message}`);
    }
}

/**
 * Test 2: C2PA Detection
 */
async function testC2PADetection() {
    console.log('\n🔍 Test 2: C2PA Detection');
    
    for (const imagePath of TEST_CONFIG.testImages) {
        try {
            const expectedResult = TEST_CONFIG.expectedResults[imagePath.split('/').pop()];
            const result = await validateImageC2PA(imagePath, expectedResult);
            
            logTestResult(`C2PA Detection: ${imagePath}`, result.success, result.message);
            
        } catch (error) {
            logTestResult(`C2PA Detection: ${imagePath}`, false, `Error: ${error.message}`);
        }
    }
}

/**
 * Test 3: Trust List Validation
 */
async function testTrustListValidation() {
    console.log('\n🛡️ Test 3: Trust List Validation');
    
    try {
        // Test trust list loading
        const trustListTest = await validateTrustLists();
        logTestResult('Trust List Loading', trustListTest.success, trustListTest.message);
        
        // Test certificate validation
        const certTest = await validateCertificateChain();
        logTestResult('Certificate Validation', certTest.success, certTest.message);
        
    } catch (error) {
        logTestResult('Trust List Validation', false, `Error: ${error.message}`);
    }
}

/**
 * Test 4: Performance Metrics
 */
async function testPerformanceMetrics() {
    console.log('\n⚡ Test 4: Performance Metrics');
    
    try {
        const startTime = performance.now();
        
        // Simulate page with multiple C2PA images
        const performanceTest = await testPageLoadPerformance();
        
        const endTime = performance.now();
        const totalTime = endTime - startTime;
        
        const success = totalTime < 2000; // Should complete within 2 seconds
        logTestResult('Performance Test', success, `Completed in ${totalTime.toFixed(2)}ms`);
        
    } catch (error) {
        logTestResult('Performance Test', false, `Error: ${error.message}`);
    }
}

/**
 * Validate C2PA image detection
 */
async function validateImageC2PA(imagePath, expectedResult) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = async () => {
            try {
                // Simulate extension processing
                const response = await chrome.runtime.sendMessage({
                    action: 'MSG_VALIDATE_URL',
                    data: img.src
                });
                
                let actualResult = 'none';
                if (response && response.manifestStore) {
                    if (response.trustList) {
                        actualResult = 'success';
                    } else if (response.manifestStore.validationStatus?.length > 0) {
                        actualResult = 'error';
                    } else {
                        actualResult = 'warning';
                    }
                } else if (response instanceof Error) {
                    actualResult = 'error';
                }
                
                const success = actualResult === expectedResult;
                resolve({
                    success,
                    message: `Expected: ${expectedResult}, Got: ${actualResult}`
                });
                
            } catch (error) {
                resolve({
                    success: false,
                    message: `Validation failed: ${error.message}`
                });
            }
        };
        
        img.onerror = () => {
            resolve({
                success: false,
                message: 'Image failed to load'
            });
        };
        
        img.src = imagePath;
    });
}

/**
 * Validate trust list functionality
 */
async function validateTrustLists() {
    try {
        // Check if trust lists are available
        const response = await chrome.runtime.sendMessage({
            action: 'MSG_GET_TRUST_LISTS'
        });
        
        if (response && response.length > 0) {
            return {
                success: true,
                message: `${response.length} trust lists loaded`
            };
        } else {
            return {
                success: false,
                message: 'No trust lists found'
            };
        }
    } catch (error) {
        return {
            success: false,
            message: `Trust list check failed: ${error.message}`
        };
    }
}

/**
 * Validate certificate chain processing
 */
async function validateCertificateChain() {
    try {
        // Test with known trusted image
        const response = await chrome.runtime.sendMessage({
            action: 'MSG_VALIDATE_URL',
            data: './media/cards_trusted.jpg'
        });
        
        if (response && response.certChain && response.certChain.length > 0) {
            return {
                success: true,
                message: `Certificate chain with ${response.certChain.length} certificates`
            };
        } else {
            return {
                success: false,
                message: 'No certificate chain found'
            };
        }
    } catch (error) {
        return {
            success: false,
            message: `Certificate validation failed: ${error.message}`
        };
    }
}

/**
 * Test page load performance
 */
async function testPageLoadPerformance() {
    return new Promise((resolve) => {
        // Create multiple test images
        const testContainer = document.createElement('div');
        testContainer.style.display = 'none';
        document.body.appendChild(testContainer);
        
        let loadedImages = 0;
        const totalImages = 5;
        
        for (let i = 0; i < totalImages; i++) {
            const img = new Image();
            img.onload = () => {
                loadedImages++;
                if (loadedImages === totalImages) {
                    document.body.removeChild(testContainer);
                    resolve({ success: true, message: `${totalImages} images processed` });
                }
            };
            img.src = `./media/cards_trusted.jpg?v=${i}`;
            testContainer.appendChild(img);
        }
        
        // Timeout after 5 seconds
        setTimeout(() => {
            if (loadedImages < totalImages) {
                document.body.removeChild(testContainer);
                resolve({ success: false, message: `Only ${loadedImages}/${totalImages} images loaded` });
            }
        }, 5000);
    });
}

/**
 * Log test result
 */
function logTestResult(testName, success, message) {
    testResults.total++;
    
    if (success) {
        testResults.passed++;
        console.log(`✅ ${testName}: ${message}`);
    } else {
        testResults.failed++;
        console.log(`❌ ${testName}: ${message}`);
    }
    
    testResults.details.push({
        test: testName,
        success,
        message,
        timestamp: new Date().toISOString()
    });
}

/**
 * Generate test report
 */
function generateTestReport() {
    console.log('\n📊 Test Report');
    console.log('==========================================');
    console.log(`Total Tests: ${testResults.total}`);
    console.log(`Passed: ${testResults.passed}`);
    console.log(`Failed: ${testResults.failed}`);
    console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
    
    if (testResults.failed > 0) {
        console.log('\n❌ Failed Tests:');
        testResults.details
            .filter(detail => !detail.success)
            .forEach(detail => {
                console.log(`  - ${detail.test}: ${detail.message}`);
            });
    }
    
    // Save results to localStorage for later analysis
    localStorage.setItem('c2pa-test-results', JSON.stringify(testResults));
    
    console.log('\n📁 Test results saved to localStorage');
    console.log('==========================================');
}

/**
 * Export test results to JSON file
 */
function exportTestResults() {
    const resultsJson = JSON.stringify(testResults, null, 2);
    const blob = new Blob([resultsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `c2pa-test-results-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
}

// Auto-run tests when script loads
if (typeof window !== 'undefined') {
    // Run tests after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runUATTests);
    } else {
        setTimeout(runUATTests, 1000); // Give extension time to initialize
    }
}

// Export functions for manual testing
if (typeof window !== 'undefined') {
    window.C2PATests = {
        runUATTests,
        exportTestResults,
        getTestResults: () => testResults
    };
}