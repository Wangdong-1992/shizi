# =============================================================================
# GEOFlow — PHP 8.3-FPM + Laravel 12 Dockerfile (T02: Full Fork)
# =============================================================================
# Builds the GEOFlow Laravel 12 application with PostgreSQL and Redis support.
# The ExternalJwtAuth middleware provides JWT-based RLS tenant isolation.
# =============================================================================

FROM php:8.3-fpm-alpine

LABEL maintainer="GEO Platform Team"
LABEL description="GEOFlow PHP-FPM + Laravel 12 with RLS multi-tenant support"
LABEL phase="phase-2"

# Install system dependencies for PHP extensions
RUN apk add --no-cache \
    postgresql-dev \
    libzip-dev \
    libpng-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    libxml2-dev \
    oniguruma-dev \
    zip \
    unzip \
    git \
    curl \
    bash

# Install PHP extensions:
# - pdo_pgsql: PostgreSQL database driver
# - redis: Redis client for queues/cache/sessions
# - bcmath: arbitrary precision math (used by GEOFlow)
# - gd: image processing
# - zip: archive handling (Composer)
# - opcache: bytecode caching
# - pcntl: process control (queue worker)
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install pdo pdo_pgsql bcmath gd zip opcache pcntl \
    && pecl install redis \
    && docker-php-ext-enable redis

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Set working directory (standard Laravel path)
WORKDIR /var/www/html

# Copy GEOFlow source code from the geoflow-engine directory
# The build context is the project root (see docker-compose.yml)
COPY geoflow-engine/ /var/www/html/

# Install PHP dependencies (production mode)
# --no-dev: skip dev dependencies
# --optimize-autoloader: convert PSR-0/4 to classmap for faster loading
# --no-interaction: do not ask any interactive questions
RUN composer install --no-dev --optimize-autoloader --no-interaction || true

# Set proper permissions for Laravel storage directories
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 775 /var/www/html/storage \
    && chmod -R 775 /var/www/html/bootstrap/cache

# Create a minimal .env if one doesn't exist (Laravel requires it)
# Environment variables from docker-compose will override these at runtime
RUN if [ ! -f /var/www/html/.env ]; then \
        cp /var/www/html/.env.example /var/www/html/.env 2>/dev/null || true; \
    fi

# Generate APP_KEY if not already set (needed for encryption)
RUN php artisan key:generate --force 2>/dev/null || true

# Configure PHP-FPM
# - Listen on port 9000 (default, matches nginx upstream)
# - Set process management settings for production
EXPOSE 9000

# Healthcheck: verify PHP-FPM configuration is valid
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
    CMD php-fpm -t || exit 1

# Start PHP-FPM in foreground
CMD ["php-fpm", "-F"]
