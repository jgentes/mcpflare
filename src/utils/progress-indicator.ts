/**
 * Progress indicator for MCP execution flow
 */

export type StepStatus = 'pending' | 'running' | 'success' | 'failed';

export interface ExecutionStep {
  name: string;
  status: StepStatus;
}

export class ProgressIndicator {
  private steps: ExecutionStep[] = [
    { name: 'Our MCP', status: 'pending' },
    { name: 'Wrangler', status: 'pending' },
    { name: 'Target MCP', status: 'pending' },
  ];

  /**
   * Update a step's status
   */
  updateStep(index: number, status: StepStatus): void {
    if (index >= 0 && index < this.steps.length) {
      this.steps[index].status = status;
      this.render();
    }
  }

  /**
   * Render the progress indicator
   */
  render(): void {
    // Clear previous line and move cursor to beginning
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    
    const parts: string[] = [];
    
    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      
      // Add step with status icon (only show icon if not pending)
      if (step.status === 'pending') {
        parts.push(step.name);
      } else {
        let icon = '';
        if (step.status === 'running') {
          icon = '⟳';
        } else if (step.status === 'success') {
          icon = '✓';
        } else if (step.status === 'failed') {
          icon = '✗';
        }
        parts.push(`${icon} ${step.name}`);
      }
      
      // Add arrow between steps (except after last)
      if (i < this.steps.length - 1) {
        parts.push('→');
      }
    }
    
    process.stdout.write(parts.join(' '));
  }

  /**
   * Clear the progress indicator
   */
  clear(): void {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
  }

  /**
   * Show final status (success or failure)
   */
  showFinal(failedAt?: number): void {
    this.clear();
    
    const parts: string[] = [];
    
    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      
      let icon = '';
      let color = '';
      if (step.status === 'success') {
        icon = '✓';
        color = '\x1b[32m'; // green
      } else if (step.status === 'failed' || (failedAt !== undefined && i === failedAt)) {
        icon = '✗';
        color = '\x1b[31m'; // red
      } else if (step.status === 'running') {
        icon = '⟳';
        color = '\x1b[33m'; // yellow
      }
      
      // Only show icon if step has a status (not pending)
      if (icon) {
        parts.push(`${color}${icon}\x1b[0m ${step.name}`);
      } else {
        parts.push(step.name);
      }
      
      if (i < this.steps.length - 1) {
        // Show arrow, but make it red if failure happened before this point
        const arrowColor = (failedAt !== undefined && i >= failedAt) ? '\x1b[31m' : '';
        parts.push(`${arrowColor}→\x1b[0m`);
      }
    }
    
    console.log(parts.join(' '));
  }

  /**
   * Reset all steps to pending
   */
  reset(): void {
    this.steps.forEach(step => {
      step.status = 'pending';
    });
  }
}

