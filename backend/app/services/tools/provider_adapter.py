"""
Provider Adapter - Capabilities and abstractions for different LLM providers

Handles the differences between providers that support native function calling
(OpenAI, Azure, Mistral) and those that need simulated tool calling (Ollama, Qwen, IBM).
"""

from dataclasses import dataclass
from typing import Dict


@dataclass
class ProviderCapabilities:
    """Capabilities of an LLM provider for tool calling"""
    native_function_calling: bool
    parallel_tool_calls: bool
    streaming_tool_calls: bool
    max_tools_per_request: int
    supports_tool_choice: bool

    @property
    def requires_simulation(self) -> bool:
        """Whether this provider needs simulated tool calling via prompts"""
        return not self.native_function_calling


# Provider capability definitions
PROVIDER_CAPABILITIES: Dict[str, ProviderCapabilities] = {
    # Native function calling support
    "openai": ProviderCapabilities(
        native_function_calling=True,
        parallel_tool_calls=True,
        streaming_tool_calls=True,
        max_tools_per_request=128,
        supports_tool_choice=True
    ),
    "azure": ProviderCapabilities(
        native_function_calling=True,
        parallel_tool_calls=True,
        streaming_tool_calls=True,
        max_tools_per_request=128,
        supports_tool_choice=True
    ),
    "mistral": ProviderCapabilities(
        native_function_calling=True,
        parallel_tool_calls=True,
        streaming_tool_calls=False,
        max_tools_per_request=64,
        supports_tool_choice=True
    ),

    # Simulated tool calling (via prompt injection)
    "ollama": ProviderCapabilities(
        native_function_calling=False,
        parallel_tool_calls=False,
        streaming_tool_calls=False,
        max_tools_per_request=10,
        supports_tool_choice=False
    ),
    "qwen": ProviderCapabilities(
        native_function_calling=False,
        parallel_tool_calls=False,
        streaming_tool_calls=False,
        max_tools_per_request=10,
        supports_tool_choice=False
    ),
    "ibm": ProviderCapabilities(
        native_function_calling=False,
        parallel_tool_calls=False,
        streaming_tool_calls=False,
        max_tools_per_request=5,
        supports_tool_choice=False
    ),
}

# Default capabilities for unknown providers
DEFAULT_CAPABILITIES = ProviderCapabilities(
    native_function_calling=False,
    parallel_tool_calls=False,
    streaming_tool_calls=False,
    max_tools_per_request=5,
    supports_tool_choice=False
)


def get_provider_capabilities(provider: str) -> ProviderCapabilities:
    """
    Get capabilities for a specific LLM provider.

    Args:
        provider: Provider identifier (e.g., "openai", "ollama")

    Returns:
        ProviderCapabilities for the given provider
    """
    return PROVIDER_CAPABILITIES.get(provider.lower(), DEFAULT_CAPABILITIES)


def supports_native_tools(provider: str) -> bool:
    """Check if a provider supports native function calling"""
    return get_provider_capabilities(provider).native_function_calling


def get_max_tools(provider: str) -> int:
    """Get the maximum number of tools that can be passed to a provider"""
    return get_provider_capabilities(provider).max_tools_per_request
