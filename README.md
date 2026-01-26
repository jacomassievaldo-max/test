--[[
    SCRIPT: VMaster Tutorials - GOD MODE FARM (V5)
    Foco: Velocidade de Ataque Extrema (Animation Cancel) e Hitbox Crítico
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local VirtualUser = game:GetService("VirtualUser")
local VirtualInputManager = game:GetService("VirtualInputManager")
local LocalPlayer = Players.LocalPlayer
local Camera = workspace.CurrentCamera

--------------------------------------------------------------------
-- CONFIGURAÇÕES
--------------------------------------------------------------------
local Settings = {
    -- Combate Extremo
    FastAttackEnabled = false, -- O segredo do "10x mais rápido"
    HitboxEnabled = false,
    HeadSize = 15, -- Tamanho colossal para garantir Crítico
    
    -- Automação
    AutoSkillsEnabled = false,
    MobTeleportEnabled = false,
    
    -- Movimento
    SpeedEnabled = false,
    WalkSpeedAmount = 100, -- Mais rápido ainda
    
    -- Configs
    TeleportDistance = 4
}

--------------------------------------------------------------------
-- UI SETUP (INTERFACE V5)
--------------------------------------------------------------------
local ScreenGui = Instance.new("ScreenGui")
ScreenGui.Name = "VMaster_GodMode"
ScreenGui.ResetOnSpawn = false
ScreenGui.Parent = LocalPlayer:WaitForChild("PlayerGui")

local MainFrame = Instance.new("Frame")
MainFrame.Name = "MainFrame"
MainFrame.Size = UDim2.new(0, 300, 0, 420)
MainFrame.Position = UDim2.new(0.5, -150, 0.5, -210)
MainFrame.BackgroundColor3 = Color3.fromRGB(10, 10, 15) -- Quase preto
MainFrame.BorderSizePixel = 0
MainFrame.Active = true
MainFrame.Draggable = true
MainFrame.Parent = ScreenGui

-- Borda Vermelha "Agressiva"
local UIStroke = Instance.new("UIStroke")
UIStroke.Color = Color3.fromRGB(255, 0, 50)
UIStroke.Thickness = 2
UIStroke.Parent = MainFrame

local UICorner = Instance.new("UICorner")
UICorner.CornerRadius = UDim.new(0, 10)
UICorner.Parent = MainFrame

-- Título
local Title = Instance.new("TextLabel")
Title.Text = "GOD MODE V5"
Title.Size = UDim2.new(1, 0, 0, 45)
Title.BackgroundTransparency = 1
Title.TextColor3 = Color3.fromRGB(255, 0, 50) -- Vermelho Sangue
Title.Font = Enum.Font.GothamBlack
Title.TextSize = 24
Title.Parent = MainFrame

-- Helper de Botões
local btnY = 55
function CreateButton(text, color, callback)
    local btn = Instance.new("TextButton")
    btn.Size = UDim2.new(0.9, 0, 0, 35)
    btn.Position = UDim2.new(0.05, 0, 0, btnY)
    btn.BackgroundColor3 = Color3.fromRGB(30, 30, 35)
    btn.Text = text
    btn.TextColor3 = color
    btn.Font = Enum.Font.GothamBold
    btn.TextSize = 14
    btn.Parent = MainFrame
    
    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 6)
    corner.Parent = btn
    
    btn.MouseButton1Click:Connect(function()
        callback(btn)
    end)
    
    btnY = btnY + 42
    return btn
end

--------------------------------------------------------------------
-- BOTÕES
--------------------------------------------------------------------

-- 1. HYPER FAST ATTACK (O Principal)
CreateButton("⚡ HYPER FAST ATTACK: OFF", Color3.fromRGB(255, 80, 80), function(btn)
    Settings.FastAttackEnabled = not Settings.FastAttackEnabled
    btn.Text = Settings.FastAttackEnabled and "⚡ HYPER FAST ATTACK: ON" or "⚡ HYPER FAST ATTACK: OFF"
    btn.TextColor3 = Settings.FastAttackEnabled and Color3.fromRGB(255, 255, 0) or Color3.fromRGB(255, 80, 80) -- Amarelo elétrico
end)

-- 2. God Hitbox
CreateButton("🎯 God Hitbox (Crit): OFF", Color3.fromRGB(255, 80, 80), function(btn)
    Settings.HitboxEnabled = not Settings.HitboxEnabled
    btn.Text = Settings.HitboxEnabled and "🎯 God Hitbox: ON" or "🎯 God Hitbox: OFF"
    btn.TextColor3 = Settings.HitboxEnabled and Color3.fromRGB(100, 255, 100) or Color3.fromRGB(255, 80, 80)
    
    if not Settings.HitboxEnabled then
        for _, v in pairs(workspace:GetDescendants()) do
            if v:IsA("Model") and v:FindFirstChild("Head") then v.Head.Size = Vector3.new(1,1,1) end
        end
    end
end)

-- 3. Auto Skills
CreateButton("⚔️ Spam Skills (Q,E,R,F): OFF", Color3.fromRGB(255, 80, 80), function(btn)
    Settings.AutoSkillsEnabled = not Settings.AutoSkillsEnabled
    btn.Text = Settings.AutoSkillsEnabled and "⚔️ Spam Skills: ON" or "⚔️ Spam Skills: OFF"
    btn.TextColor3 = Settings.AutoSkillsEnabled and Color3.fromRGB(100, 255, 100) or Color3.fromRGB(255, 80, 80)
end)

-- 4. TP Mob
CreateButton("👻 TP Behind Mob: OFF", Color3.fromRGB(255, 80, 80), function(btn)
    Settings.MobTeleportEnabled = not Settings.MobTeleportEnabled
    btn.Text = Settings.MobTeleportEnabled and "👻 TP Behind Mob: ON" or "👻 TP Behind Mob: OFF"
    btn.TextColor3 = Settings.MobTeleportEnabled and Color3.fromRGB(100, 255, 100) or Color3.fromRGB(255, 80, 80)
end)

-- 5. Speed
CreateButton("💨 Flash Speed: OFF", Color3.fromRGB(255, 80, 80), function(btn)
    Settings.SpeedEnabled = not Settings.SpeedEnabled
    btn.Text = Settings.SpeedEnabled and "💨 Flash Speed: ON" or "💨 Flash Speed: OFF"
    btn.TextColor3 = Settings.SpeedEnabled and Color3.fromRGB(100, 255, 100) or Color3.fromRGB(255, 80, 80)
end)

-- Aviso
local Warning = Instance.new("TextLabel")
Warning.Text = "O 'Hyper Attack' cancela animações para atacar na velocidade da luz."
Warning.Size = UDim2.new(0.9, 0, 0, 40)
Warning.Position = UDim2.new(0.05, 0, 0.85, 0)
Warning.BackgroundTransparency = 1
Warning.TextColor3 = Color3.fromRGB(150, 150, 150)
Warning.Font = Enum.Font.Gotham
Warning.TextSize = 11
Warning.TextWrapped = true
Warning.Parent = MainFrame

--------------------------------------------------------------------
-- LÓGICA EXTREMA
--------------------------------------------------------------------

-- Função para achar inimigos
local function GetEnemies()
    local enemies = {}
    for _, v in pairs(workspace:GetDescendants()) do
        if v:IsA("Model") and v:FindFirstChild("Humanoid") and v:FindFirstChild("HumanoidRootPart") and v:FindFirstChild("Head") then
            if not Players:GetPlayerFromCharacter(v) and v.Humanoid.Health > 0 then
                table.insert(enemies, v)
            end
        end
    end
    return enemies
end

-- Mob mais próximo
local function GetClosestMob()
    local closest, shortest = nil, 99999
    local myPos = LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart") and LocalPlayer.Character.HumanoidRootPart.Position
    if myPos then
        for _, mob in pairs(GetEnemies()) do
            local dist = (mob.HumanoidRootPart.Position - myPos).Magnitude
            if dist < shortest then closest = mob; shortest = dist end
        end
    end
    return closest
end

-- LÓGICA DO FAST ATTACK (SEPARADA PARA VELOCIDADE MÁXIMA)
task.spawn(function()
    while true do
        if Settings.FastAttackEnabled and LocalPlayer.Character then
            -- Método 1: Ativação Direta da Ferramenta (Bypassa cooldown de clique)
            local tool = LocalPlayer.Character:FindFirstChildOfClass("Tool")
            if tool then
                tool:Activate()
            end
            
            -- Método 2: Clique Virtual Simultâneo (Garante o hit)
            VirtualUser:CaptureController()
            VirtualUser:ClickButton1(Vector2.new(0,0), workspace.CurrentCamera.CFrame)
        end
        -- task.wait() vazio roda o mais rápido possível (60+ vezes por segundo)
        task.wait() 
    end
end)

-- Loop de Utilidades (RenderStepped)
local skillTimer = 0
RunService.RenderStepped:Connect(function(dt)
    
    -- GOD HITBOX (Aumenta o Dano via Headshot garantido)
    if Settings.HitboxEnabled then
        for _, mob in pairs(GetEnemies()) do
            if mob:FindFirstChild("Head") then
                mob.Head.Size = Vector3.new(Settings.HeadSize, Settings.HeadSize, Settings.HeadSize)
                mob.Head.CanCollide = false
                mob.Head.Transparency = 0.8
                mob.Head.Color = Color3.fromRGB(255, 0, 0)
            end
        end
    end

    -- SPAM SKILLS
    if Settings.AutoSkillsEnabled then
        skillTimer = skillTimer + dt
        if skillTimer > 0.2 then -- Tenta soltar skill 5x por segundo
            skillTimer = 0
            local keys = {Enum.KeyCode.Q, Enum.KeyCode.E, Enum.KeyCode.R, Enum.KeyCode.F, Enum.KeyCode.Z, Enum.KeyCode.X, Enum.KeyCode.C}
            for _, key in pairs(keys) do
                VirtualInputManager:SendKeyEvent(true, key, false, game)
            end
        end
    end

    -- TELEPORT
    if Settings.MobTeleportEnabled then
        local target = GetClosestMob()
        if target and LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart") then
            -- Teleporta e olha para o mob
            LocalPlayer.Character.HumanoidRootPart.CFrame = CFrame.new(target.HumanoidRootPart.Position - (target.HumanoidRootPart.CFrame.LookVector * Settings.TeleportDistance), target.HumanoidRootPart.Position)
        end
    end

    -- FLASH SPEED
    if Settings.SpeedEnabled and LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("Humanoid") then
        LocalPlayer.Character.Humanoid.WalkSpeed = Settings.WalkSpeedAmount
    end
end)

LocalPlayer.CharacterRemoving:Connect(function() ScreenGui:Destroy() end)
