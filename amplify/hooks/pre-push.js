/**
 * This is a pre-push hook that prepares the Lambda layer
 * by installing Python dependencies before deployment
 */
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

try {
  console.log('Preparing Lambda layer dependencies...');
  
  const layerDir = path.join(process.cwd(), 'amplify/functions/brain/layer');
  const pythonDir = path.join(layerDir, 'python');
  
  // Create python directory if it doesn't exist
  if (!fs.existsSync(pythonDir)) {
    fs.mkdirSync(pythonDir, { recursive: true });
  }
  
  // Install dependencies into the python directory
  console.log('Installing Python dependencies...');
  execSync(`pip install -r ${path.join(layerDir, 'requirements.txt')} -t ${pythonDir}`, {
    stdio: 'inherit'
  });
  
  console.log('Lambda layer dependencies prepared successfully');
} catch (error) {
  console.error('Error preparing Lambda layer:', error);
  process.exit(1);
}
