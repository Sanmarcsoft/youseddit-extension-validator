#!/usr/bin/env node

/**
 * C2PA Extension UAT Test Server
 * Simple web server to serve test files over localhost
 */

const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors());

// Serve static files from test directory
app.use(express.static(path.join(__dirname)));

// Serve project root for accessing test media
app.use('/project', express.static(path.join(__dirname, '..')));

// Main test routes
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>C2PA Extension UAT Test Server</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    max-width: 800px; 
                    margin: 50px auto; 
                    padding: 20px;
                    line-height: 1.6;
                }
                .test-link {
                    display: block;
                    padding: 15px;
                    margin: 10px 0;
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: 5px;
                    text-decoration: none;
                    color: #495057;
                    transition: background-color 0.2s;
                }
                .test-link:hover {
                    background: #e9ecef;
                    text-decoration: none;
                }
                .server-info {
                    background: #d4edda;
                    border: 1px solid #c3e6cb;
                    border-radius: 5px;
                    padding: 15px;
                    margin: 20px 0;
                }
                .instruction {
                    background: #e7f3ff;
                    border: 1px solid #bee5eb;
                    border-radius: 5px;
                    padding: 15px;
                    margin: 20px 0;
                }
            </style>
        </head>
        <body>
            <h1>🔒 C2PA Extension UAT Test Server</h1>
            
            <div class="server-info">
                <h3>✅ Server Running Successfully</h3>
                <p><strong>URL:</strong> http://localhost:${PORT}</p>
                <p><strong>Status:</strong> Ready for testing</p>
            </div>

            <div class="instruction">
                <h3>📋 Before Testing:</h3>
                <ol>
                    <li><strong>Install Extension:</strong> Load C2PA extension in Chrome (chrome://extensions/ → Load unpacked → select dist/chrome/)</li>
                    <li><strong>Enable Developer Mode:</strong> Make sure Developer Mode is ON in Chrome extensions</li>
                    <li><strong>Start Testing:</strong> Click any test link below</li>
                </ol>
            </div>

            <h2>🧪 Available Tests:</h2>
            
            <a href="/quick-validation-test.html" class="test-link">
                <strong>🚀 Quick Validation Test</strong>
                <br>Fast 4-image test to verify basic C2PA functionality
                <br><em>Recommended for initial testing</em>
            </a>
            
            <a href="/UAT_TEST_SUITE.html" class="test-link">
                <strong>📊 Comprehensive UAT Test Suite</strong>
                <br>Complete 21-image test suite with all validation scenarios
                <br><em>Full testing coverage</em>
            </a>
            
            <a href="/public-tests.html" class="test-link">
                <strong>🌐 Public C2PA Test Files</strong>
                <br>External C2PA test images from c2pa.org
                <br><em>Real-world validation</em>
            </a>
            
            <a href="/origin-tests.html" class="test-link">
                <strong>📰 Project Origin Test Files</strong>
                <br>News publisher verified C2PA content
                <br><em>Industry standard validation</em>
            </a>

            <h2>📁 Additional Resources:</h2>
            
            <a href="/UAT_PLAN.md" class="test-link">
                <strong>📋 UAT Plan Documentation</strong>
                <br>Complete testing strategy and methodology
            </a>
            
            <a href="/UAT_FINAL_REPORT.md" class="test-link">
                <strong>📊 Final UAT Report</strong>
                <br>Issue resolution and testing results
            </a>
            
            <a href="/HOW_TO_TEST_NOW.md" class="test-link">
                <strong>🚀 Testing Instructions</strong>
                <br>Step-by-step testing guide
            </a>

            <div style="margin-top: 40px; padding: 20px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px;">
                <h3>🎯 Success Criteria:</h3>
                <ul>
                    <li>✅ Green C2PA icons appear on trusted images</li>
                    <li>⚠️ Yellow/orange icons on untrusted images</li>
                    <li>❌ No icons on regular images without C2PA</li>
                    <li>🖱️ Clicking icons opens metadata overlay</li>
                    <li>📝 Right-click shows "Inspect Content Credentials"</li>
                </ul>
            </div>

            <footer style="margin-top: 40px; padding: 20px; border-top: 1px solid #dee2e6; color: #6c757d; text-align: center;">
                <p>C2PA Extension UAT Test Server v0.1.3</p>
                <p>To stop server: Press Ctrl+C in terminal</p>
            </footer>
        </body>
        </html>
    `);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        server: 'C2PA UAT Test Server',
        version: '0.1.3',
        port: PORT,
        timestamp: new Date().toISOString()
    });
});

// API endpoint to get test results
app.get('/api/test-status', (req, res) => {
    res.json({
        server: 'running',
        tests_available: [
            'quick-validation-test.html',
            'UAT_TEST_SUITE.html', 
            'public-tests.html',
            'origin-tests.html'
        ],
        documentation: [
            'UAT_PLAN.md',
            'UAT_FINAL_REPORT.md',
            'HOW_TO_TEST_NOW.md'
        ]
    });
});

// Start server
app.listen(PORT, () => {
    console.log('\n🔒 C2PA Extension UAT Test Server');
    console.log('=====================================');
    console.log(`✅ Server running at: http://localhost:${PORT}`);
    console.log(`📁 Serving files from: ${__dirname}`);
    console.log('');
    console.log('🧪 Available tests:');
    console.log(`   • Quick Test: http://localhost:${PORT}/quick-validation-test.html`);
    console.log(`   • Full Suite: http://localhost:${PORT}/UAT_TEST_SUITE.html`);
    console.log(`   • Public Tests: http://localhost:${PORT}/public-tests.html`);
    console.log('');
    console.log('📋 Instructions:');
    console.log('   1. Install C2PA extension in Chrome');
    console.log('   2. Open any test URL above');
    console.log('   3. Look for C2PA icons on images');
    console.log('');
    console.log('⏹️  To stop server: Press Ctrl+C');
    console.log('=====================================\n');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down UAT test server...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 UAT test server terminated');
    process.exit(0);
});