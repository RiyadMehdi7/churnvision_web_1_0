import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  RiskThresholds
} from '@/config/riskThresholds';
import { useDynamicRiskRanges } from '@/hooks/useDynamicRiskThresholds';
import { useToast } from '@/hooks/use-toast';
import { Brain, Zap } from 'lucide-react';

interface RiskThresholdSettingsProps {
  employees?: Array<{ churnProbability?: number }>;
  onThresholdChange?: (thresholds: RiskThresholds) => void;
}

export function RiskThresholdSettings({ employees = [] }: RiskThresholdSettingsProps) {
  const {
    autoConfig,
    autoAdjust,
    calculateRiskDistribution,
    isLoading,
    error,
  } = useDynamicRiskRanges();
  
  const { toast } = useToast();

  // Calculate current distribution using dynamic thresholds
  const currentDistribution = calculateRiskDistribution(employees);
  const total = employees.length;
  
  const handleAutoAdjustToggle = (enabled: boolean) => {
    // This is a placeholder for the actual implementation
    console.log('Auto-adjustment toggled:', enabled);
  };
  
  const handleForceAdjustment = async () => {
    if (employees.length === 0) {
      toast({
        title: "No Data Available",
        description: "Employee data is required for auto-adjustment.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    
    const result = await autoAdjust(employees, true);
    
    if (result.adjusted) {
      toast({
        title: "Auto-Adjustment Complete",
        description: "Thresholds have been optimized based on current data.",
        duration: 3000,
      });
    } else {
      toast({
        title: "No Adjustment Needed",
        description: result.reason || "Current thresholds are already optimal.",
        duration: 3000,
      });
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Risk Threshold Settings</CardTitle>
        <CardDescription>
          These thresholds are dynamically adjusted based on your data to provide the most accurate risk assessment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Distribution Preview */}
        {total > 0 && (
          <div className="space-y-2">
            <Label>Current Distribution ({total} employees)</Label>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <div className="text-red-600 font-semibold text-lg">{currentDistribution.high}</div>
                <div className="text-red-600 text-sm">High Risk</div>
                <div className="text-gray-500 text-xs">
                  {total > 0 ? `${((currentDistribution.high / total) * 100).toFixed(1)}%` : '0%'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                <div className="text-orange-600 font-semibold text-lg">{currentDistribution.medium}</div>
                <div className="text-orange-600 text-sm">Medium Risk</div>
                <div className="text-gray-500 text-xs">
                  {total > 0 ? `${((currentDistribution.medium / total) * 100).toFixed(1)}%` : '0%'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                <div className="text-green-600 font-semibold text-lg">{currentDistribution.low}</div>
                <div className="text-green-600 text-sm">Low Risk</div>
                <div className="text-gray-500 text-xs">
                  {total > 0 ? `${((currentDistribution.low / total) * 100).toFixed(1)}%` : '0%'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Auto-Adjustment Controls */}
        <div className="space-y-4 border-t pt-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                Auto-Adjustment
              </Label>
              <p className="text-sm text-gray-500">
                Automatically optimize thresholds based on data patterns
              </p>
            </div>
            <Switch
              checked={autoConfig.enabled}
              onCheckedChange={handleAutoAdjustToggle}
              disabled={isLoading}
            />
          </div>
          
          {autoConfig.enabled && (
            <div className="grid grid-cols-1 gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleForceAdjustment}
                disabled={isLoading || employees.length === 0}
                className="flex items-center gap-2"
              >
                <Zap className="w-4 h-4" />
                Adjust Now
              </Button>
            </div>
          )}
        </div>
        
        {/* Status and Actions */}
        <div className="flex justify-between items-center border-t pt-4">
          <div className="text-sm text-gray-500">
            {error && (
              <span className="text-red-500">Error: {error}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}