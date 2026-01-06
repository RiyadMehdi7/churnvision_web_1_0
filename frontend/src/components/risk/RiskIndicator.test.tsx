import { render, screen } from '@testing-library/react';
import { RiskIndicator } from '@/components/risk/RiskIndicator';
import { describe, it, expect } from 'vitest';
import { getCurrentThresholds } from '../../config/riskThresholds';

describe('RiskIndicator', () => {
  const thresholds = getCurrentThresholds();

  it('renders Low risk correctly', () => {
    render(<RiskIndicator riskScore={0.1} showIcon />);
    expect(screen.getByText('Low Risk')).toBeInTheDocument();
    expect(screen.getByTitle('Risk Level: Low (10%)')).toBeInTheDocument();
  });

  it('renders Medium risk correctly', () => {
    render(<RiskIndicator riskScore={thresholds.mediumRisk + 0.1} showIcon />);
    expect(screen.getByText('Medium Risk')).toBeInTheDocument();
  });

  it('renders High risk correctly', () => {
    render(<RiskIndicator riskScore={thresholds.highRisk + 0.1} showIcon />);
    expect(screen.getByText('High Risk')).toBeInTheDocument();
  });

  it('shows percentage when showPercent is true', () => {
    render(<RiskIndicator riskScore={0.5} showPercent />);
    expect(screen.getByText('(50%)')).toBeInTheDocument();
  });

  it('hides percentage when showPercent is false', () => {
    render(<RiskIndicator riskScore={0.5} showPercent={false} />);
    expect(screen.queryByText('(50%)')).not.toBeInTheDocument();
  });

  it('handles riskScore of 0', () => {
    render(<RiskIndicator riskScore={0} />);
    expect(screen.getByText('Low Risk')).toBeInTheDocument();
    expect(screen.getByTitle('Risk Level: Low (0%)')).toBeInTheDocument();
  });

  it('handles riskScore of 1', () => {
    render(<RiskIndicator riskScore={1} />);
    expect(screen.getByText('High Risk')).toBeInTheDocument();
    expect(screen.getByTitle('Risk Level: High (100%)')).toBeInTheDocument();
  });

  it('handles riskScore at the medium threshold', () => {
    render(<RiskIndicator riskScore={thresholds.mediumRisk} />);
    expect(screen.getByText('Medium Risk')).toBeInTheDocument();
  });

  it('handles riskScore just above the medium threshold', () => {
    render(<RiskIndicator riskScore={thresholds.mediumRisk + 0.001} />);
    expect(screen.getByText('Medium Risk')).toBeInTheDocument();
  });

  it('handles riskScore at the high threshold', () => {
    render(<RiskIndicator riskScore={thresholds.highRisk} />);
    expect(screen.getByText('High Risk')).toBeInTheDocument();
  });

  it('handles riskScore just above the high threshold', () => {
    render(<RiskIndicator riskScore={thresholds.highRisk + 0.001} />);
    expect(screen.getByText('High Risk')).toBeInTheDocument();
  });

  it('handles null riskScore', () => {
    render(<RiskIndicator riskScore={null} />);
    expect(screen.getByText('Low Risk')).toBeInTheDocument();
    expect(screen.getByTitle('Risk Level: Low (0%)')).toBeInTheDocument();
  });

  it('handles undefined riskScore', () => {
    render(<RiskIndicator riskScore={undefined} />);
    expect(screen.getByText('Low Risk')).toBeInTheDocument();
    expect(screen.getByTitle('Risk Level: Low (0%)')).toBeInTheDocument();
  });

  it('renders small size correctly', () => {
    const { container } = render(<RiskIndicator riskScore={0.5} size="sm" />);
    expect(container.firstChild).toHaveClass('text-xs');
  });

  it('renders medium size correctly', () => {
    const { container } = render(<RiskIndicator riskScore={0.5} size="md" />);
    expect(container.firstChild).toHaveClass('text-sm');
  });

  it('renders large size correctly', () => {
    const { container } = render(<RiskIndicator riskScore={0.5} size="lg" />);
    expect(container.firstChild).toHaveClass('text-base');
  });

  it('hides icon when showIcon is false', () => {
    const { container } = render(<RiskIndicator riskScore={0.5} showIcon={false} />);
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });
});
